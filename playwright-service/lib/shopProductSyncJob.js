// Walks a queue of shops, crawling each one's brand_offer grid, and tracks the
// sweep's status in memory so callers get an immediate 202 + poll instead of
// holding a connection open for what is a multi-minute browser job - the same
// contract, and the same reason, as lib/productOfferSyncJob.js (Cloudflare's
// ~100s upstream timeout returns its own 524 page long before a crawl finishes,
// while the crawl itself completes fine).
const { runShopProductSync } = require('./shopOfferScraper');
const shopsRepo = require('./repositories/shops');
const browserJobLock = require('./browserJobLock');
const { withJobRun } = require('./jobRunner');

const JOB_NAME = 'shop-product-crawl';

// How many shops one sweep may touch. Deliberately small: at 5 pages a shop
// this is already ~800 products and 10-15 minutes of browser time, on a 2-core
// VPS that shares its Chromium with the /app/link tab pool (see the OOM note in
// lib/browserManager.js). Raise it from the dashboard, not from here.
const MAX_SHOPS = parseInt(process.env.SHOP_CRAWL_MAX_SHOPS || '8', 10);
// Pause between two shops, on top of the per-page pacing inside the crawl.
const SHOP_DELAY_MS = parseInt(process.env.SHOP_CRAWL_SHOP_DELAY_MS || '8000', 10);
// How stale a shop's last crawl has to be before it comes round again.
const TTL_HOURS = parseInt(process.env.SHOP_CRAWL_TTL_HOURS || '72', 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Crawls shops one at a time.
 *
 * Sequential on purpose, not for politeness but because there is one shared
 * Playwright context: two crawls at once would fight over the same browser.
 * That also makes the pacing honest - one shop's pages, a pause, the next.
 *
 * `shopId` crawls exactly that shop and skips the queue entirely, including
 * shops still marked `discovered`. That is the manual path: a `discovered` shop
 * is unverified by-catch from a keyword search, so it is never swept
 * automatically, but an admin who has looked at it can opt it in one at a time.
 *
 * One shop failing never stops the sweep - its error is recorded on the shop row
 * (`lastCrawlError`) and the next shop is tried - except when the failure says
 * the session is dead, which would make every remaining shop fail the same way.
 */
async function runShopCrawlSweep({ maxShops = MAX_SHOPS, maxPages, shopId, ttlHours = TTL_HOURS } = {}) {
  let shops;
  if (shopId) {
    const shop = await shopsRepo.getByShopId(shopId);
    if (!shop) return { scanned: 0, crawled: 0, empty: 0, failed: 0, scraped: 0, saved: 0, error: 'shop_not_found' };
    shops = [shop];
  } else {
    shops = await shopsRepo.listCrawlQueue({ limit: maxShops, ttlHours });
  }

  const summary = { scanned: shops.length, crawled: 0, empty: 0, failed: 0, scraped: 0, saved: 0, shops: [] };
  const touched = [];
  let stoppedBecause = null;

  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    try {
      const result = await runShopProductSync({ shopId: shop.shopId, maxPages });
      summary.scraped += result.scraped;
      summary.saved += result.saved;
      if (result.empty) summary.empty++;
      else summary.crawled++;
      summary.shops.push({ shopId: shop.shopId, name: shop.name, ...result });
      touched.push(shop.shopId);
      // `stoppedEarly` is a partial success: the pages before it are saved, so
      // it is kept on the row as a note rather than counted as a failure.
      await shopsRepo.markCrawled(shop.shopId, { error: result.stoppedEarly || null });
    } catch (err) {
      summary.failed++;
      summary.shops.push({ shopId: shop.shopId, name: shop.name, error: err.message });
      await shopsRepo.markCrawled(shop.shopId, { error: err.message }).catch(() => {});
      if (/not logged in/i.test(err.message)) {
        stoppedBecause = 'session_expired';
        break;
      }
    }

    if (i < shops.length - 1) await sleep(SHOP_DELAY_MS);
  }

  // Recomputes product_count for exactly the shops this sweep touched, and
  // promotes any `discovered` shop that now has products to `linked` - which is
  // what makes it visible in the app.
  if (touched.length) summary.shopsPromoted = await shopsRepo.refreshProductCounts(touched);
  if (stoppedBecause) summary.error = stoppedBecause;
  return summary;
}

let state = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
  waitingForBrowser: false,
  jobRunId: null,
};

function getStatus() {
  return { ...state };
}

// No-op while a sweep is already running: the in-memory guard is the
// idempotency contract behind 202 + poll (a double-clicked button must not
// queue a second crawl), and is kept alongside the browser lock, which answers
// the different question of whether the browser is busy with any job at all.
function startAndWait(options = {}) {
  if (state.status === 'running') return Promise.resolve({ skipped: 'already_running' });

  const { trigger = 'admin', ...sweepOptions } = options;

  state = {
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null,
    waitingForBrowser: true,
    jobRunId: null,
  };

  // One lock for the WHOLE sweep, not one per shop: releasing between shops
  // would let the daily product_offer scrape slip in halfway through and leave
  // both jobs interleaving pages on the same browser. Taken outside withJobRun
  // so time spent queueing behind another browser job is not billed to this
  // run's `job_runs.duration_ms`.
  return browserJobLock
    .run(JOB_NAME, () => {
      state = { ...state, waitingForBrowser: false };
      return withJobRun(JOB_NAME, trigger, ({ runId }) => {
        state = { ...state, jobRunId: runId };
        return runShopCrawlSweep(sweepOptions);
      }, {
        // An empty queue is the normal overnight case once every shop is
        // fresh - keeping those heartbeats would bury the sweeps that did work.
        discardIf: (result) => result && result.scanned === 0 && !result.error,
      });
    })
    .then((result) => {
      state = { ...state, status: 'done', finishedAt: new Date().toISOString(), waitingForBrowser: false, result };
      console.log(`shop-product-crawl: ${JSON.stringify({ ...result, shops: undefined })}`);
      return result;
    })
    .catch((err) => {
      state = {
        ...state,
        status: 'error',
        finishedAt: new Date().toISOString(),
        waitingForBrowser: false,
        error: err.message,
      };
      console.error('shop-product-crawl failed', err.message);
      // Resolves rather than rejects, for the same reason as the resolve job:
      // the failure is already on the job_runs row and in `state`, and an
      // awaiting caller wants the outcome, not an exception to handle.
      return { error: err.message };
    });
}

// Fire-and-forget entry point: kicks the sweep off and answers immediately with
// the status the 202 + poll endpoints hand back.
function start(options = {}) {
  startAndWait(options);
  return getStatus();
}

module.exports = { getStatus, start, startAndWait, runShopCrawlSweep, JOB_NAME, MAX_SHOPS };
