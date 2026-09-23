// Runs the shop-name resolution sweep in the background and tracks its status
// in memory, so the admin dashboard's "Tra tên shop" button and the cron both
// get an immediate answer instead of holding a connection open - same shape and
// same reason as lib/productOfferSyncJob.js (Cloudflare's ~100s upstream
// timeout returns its own 524 page long before a full batch finishes).
const { resolvePendingShopNames } = require('./shopResolution');
const { withJobRun } = require('./jobRunner');

const JOB_NAME = 'shop-name-resolve';

let state = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
  jobRunId: null,
};

function getStatus() {
  return { ...state };
}

/**
 * No-op (returns the running state as-is) while a sweep is in flight: this is
 * the idempotency contract behind the 202 + poll endpoint, so a double-click
 * cannot queue a second sweep against Shopee's rate budget.
 *
 * Deliberately does NOT take browserJobLock. Resolution is pure JSON API work;
 * making it queue behind a 20-minute crawl would stall it for no reason. The
 * one path that can touch Playwright - shopeeAffiliateApi's page-transport
 * fallback - takes the lock itself with tryRun (never waits), so nothing here
 * can sit on the browser.
 */
function start(options = {}) {
  if (state.status === 'running') return getStatus();

  const { trigger = 'admin', ...sweepOptions } = options;

  state = {
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null,
    jobRunId: null,
  };

  withJobRun(
    JOB_NAME,
    trigger,
    ({ runId }) => {
      state = { ...state, jobRunId: runId };
      return resolvePendingShopNames(sweepOptions);
    },
    {
      // Once the queue is drained this wakes every ten minutes and finds
      // nothing - 144 empty rows a day would bury the sweeps that did work.
      // A sweep that stopped early (`error`) is never dropped, however empty.
      discardIf: (result) =>
        !!result && !result.error && result.scanned === 0 && result.namesDiscovered === 0,
    }
  )
    .then((result) => {
      state = { ...state, status: 'done', finishedAt: new Date().toISOString(), result };
      console.log(`shop-name-resolve: ${JSON.stringify(result)}`);
    })
    .catch((err) => {
      state = { ...state, status: 'error', finishedAt: new Date().toISOString(), error: err.message };
      console.error('shop-name-resolve failed', err.message);
    });

  return getStatus();
}

module.exports = { getStatus, start, JOB_NAME };
