// Runs the data jobs back to back instead of waiting for their crons.
//
// Why this exists: there are no users on the app or the site yet, so the whole
// VPS is free to finish the catalogue. A cron that fires every ten minutes and
// then sits idle for nine of them is the wrong shape for that. This module
// keeps the same jobs, the same batch sizes and the same kill switches, and
// only changes what happens between two runs: instead of waiting for the next
// tick, wait for a gap measured in seconds.
//
// Both clocks stay wired permanently. `job_mode` decides which one drives:
// 'continuous' here, 'cron' in server.js. Flipping it from the dashboard is
// live - the loops re-read it every cycle and the crons re-read it every tick -
// so switching back to scheduled mode later never needs a redeploy.
//
// THREE loops, not one per job, because the jobs share upstream budgets, and a
// budget is what has to be paced:
//
//   source - backfillMissingCategories + backfillMissingShopIds. Both only ever
//            call addlivetag, which is ours. Genuinely free to run flat out;
//            the short gap is tidiness, not protection.
//   shopee - resolvePendingShopNames + enrichShopDetails. Both spend calls on
//            Shopee's affiliate API. NOT limited by our server - limited by how
//            much exposure the affiliate account should take. Paced, and it
//            steps back the moment the circuit breaker opens.
//   crawl  - runShopCrawlSweep. Drives the one shared Chromium, so it can only
//            ever be one at a time anyway; the browser lock enforces that and
//            the gap leaves room for the daily product_offer scrape.
//
// Pairing two jobs inside one loop is deliberate: run them in sequence and they
// take turns on the shared budget by construction, with no coordination needed.
const settingsRepo = require('./repositories/settings');
const { withJobRun } = require('./jobRunner');
const { backfillMissingCategories } = require('./categoryEnrichment');
const { backfillMissingShopIds } = require('./shopLinkBackfill');
const { enrichShopDetails } = require('./shopDetailEnrichment');
const shopNameResolveJob = require('./shopNameResolveJob');
const shopProductSyncJob = require('./shopProductSyncJob');

const TRIGGER = 'continuous';
// Let the service finish booting (migrations, browser warm-up, first health
// check) before the first cycle competes for the same 2 cores.
const BOOT_DELAY_MS = parseInt(process.env.CONTINUOUS_BOOT_DELAY_MS || '20000', 10);
// How long a loop waits after an unexpected throw. Long enough not to hammer a
// broken dependency, short enough to recover on its own once it heals.
const ERROR_BACKOFF_MS = 60 * 1000;
// How often a loop re-checks `job_mode` while cron is driving. Cheap enough to
// make the dashboard switch feel immediate.
const MODE_POLL_MS = 60 * 1000;
// Fallbacks for when Shopee pushes back without telling us for how long.
const BLOCKED_COOLDOWN_MS = 30 * 60 * 1000;
// A dead session needs a person (`npm run seed-login`). Keep checking anyway,
// so the loop picks itself up the moment someone re-seeds the cookie.
const SESSION_COOLDOWN_MS = 15 * 60 * 1000;

const alwaysEnabled = async () => true;

// addlivetag answering "slow down" is the only pacing signal that loop has.
function sourceCooldown(result) {
  if (!result || !result.sourceRateLimited) return 0;
  const seconds = Number(result.sourceCooldownSeconds) || 60;
  return Math.min(Math.max(seconds, 1), 900) * 1000;
}

// Shopee pushing back is a hard stop, not a hint: retrying is what deepens a
// block, so the whole loop - both jobs in it - waits out the cooldown.
function shopeeCooldown(result) {
  if (!result) return 0;
  if (result.error === 'shopee_blocked') {
    const ms = Number(result.retryAfterMs);
    return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 6 * 60 * 60 * 1000) : BLOCKED_COOLDOWN_MS;
  }
  if (result.error === 'session_expired') return SESSION_COOLDOWN_MS;
  return 0;
}

/**
 * Did the queue actually move?
 *
 * NOT "did it scan anything" - that is the trap. Every one of these jobs stamps
 * the rows it handled so they drop out of the queue, except the ones it counts
 * as `retryable`, which come back unchanged on the very next pass. A handful of
 * permanently-retryable rows would therefore look like work forever and spin
 * the loop at its busy gap, hammering upstream for nothing.
 *
 * `scanned - retryable` is the honest measure: rows that left the queue. A row
 * that failed but got stamped still counts, because the queue is one shorter.
 */
function madeProgress(result, extraFields = []) {
  if (!result || result.skipped) return false;
  const scanned = Number(result.scanned) || 0;
  const retryable = Number(result.retryable) || 0;
  if (scanned - retryable > 0) return true;
  return extraFields.some((field) => Number(result[field]) > 0);
}

// Keeps the status payload small: a crawl sweep's `shops` array can carry a
// hundred rows, and this is polled by a dashboard.
function compactResult(result) {
  if (!result || typeof result !== 'object') return result ?? null;
  const { shops, ...rest } = result;
  if (Array.isArray(shops)) rest.shopsTouched = shops.length;
  return rest;
}

const LOOP_DEFS = [
  {
    key: 'source',
    label: 'Bổ sung dữ liệu từ addlivetag',
    gapField: 'sourceSec',
    tasks: [
      {
        job: 'category-backfill',
        isEnabled: alwaysEnabled,
        run: () => backfillMissingCategories(),
        hasWork: (r) => madeProgress(r),
        discardIf: (r) => r && r.scanned === 0,
        cooldownMs: sourceCooldown,
      },
      {
        job: 'shop-link-backfill',
        isEnabled: alwaysEnabled,
        run: () => backfillMissingShopIds(),
        hasWork: (r) => madeProgress(r),
        discardIf: (r) => r && r.scanned === 0,
        cooldownMs: sourceCooldown,
      },
    ],
  },
  {
    key: 'shopee',
    label: 'Gọi API Shopee (tra tên shop, lấy chi tiết shop)',
    gapField: 'shopeeSec',
    tasks: [
      {
        job: 'shop-name-resolve',
        isEnabled: () => settingsRepo.getShopResolveEnabled(),
        // Already wrapped in withJobRun by the driver, which also owns the
        // in-memory status the dashboard polls - so the loop must not wrap it
        // again or there would be two job_runs rows for one sweep.
        tracked: true,
        run: async () =>
          shopNameResolveJob.startAndWait({
            batchSize: await settingsRepo.getShopResolveBatchSize(),
            trigger: TRIGGER,
          }),
        // Discovering new names is progress even when no row resolved: the
        // queue got longer, and the next pass has something to chew on.
        hasWork: (r) => madeProgress(r, ['namesDiscovered']),
        cooldownMs: shopeeCooldown,
      },
      {
        job: 'shop-detail-enrich',
        isEnabled: () => settingsRepo.getShopDetailEnabled(),
        run: async () => enrichShopDetails({ batchSize: await settingsRepo.getShopDetailBatchSize() }),
        hasWork: (r) => madeProgress(r),
        discardIf: (r) => r && r.scanned === 0 && !r.error,
        cooldownMs: shopeeCooldown,
      },
    ],
  },
  {
    key: 'crawl',
    label: 'Crawl sản phẩm theo shop',
    gapField: 'crawlSec',
    tasks: [
      {
        job: 'shop-product-crawl',
        isEnabled: () => settingsRepo.getShopCrawlEnabled(),
        // Tracked for the same reason as shop-name-resolve, plus this one takes
        // the shared browser lock inside its driver.
        tracked: true,
        run: async () =>
          shopProductSyncJob.startAndWait({
            maxShops: await settingsRepo.getShopCrawlMaxShops(),
            maxPages: await settingsRepo.getShopCrawlMaxPages(),
            trigger: TRIGGER,
          }),
        // No `retryable` here: every shop the sweep touches is stamped with
        // lastCrawledAt, win or lose, so scanning any at all moved the queue.
        hasWork: (r) => madeProgress(r, ['scanned']),
        cooldownMs: (r) => (r && r.error === 'session_expired' ? SESSION_COOLDOWN_MS : 0),
      },
    ],
  },
];

const loops = LOOP_DEFS.map((def) => ({
  ...def,
  running: false,
  timer: null,
  state: {
    phase: 'stopped', // stopped | standby | off | working | idle | cooling
    cycles: 0,
    lastJob: null,
    lastResult: null,
    lastFinishedAt: null,
    lastError: null,
    nextWakeAt: null,
  },
}));

/**
 * One pass over a loop's jobs, in order.
 *
 * A job that is switched off is skipped without touching its budget, and one
 * that throws never stops the pass - the next job still gets its turn, because
 * the two halves of a pair fail for unrelated reasons (addlivetag being down
 * says nothing about Shopee).
 */
async function runCycle(loop) {
  let didWork = false;
  let cooldownMs = 0;
  let enabledCount = 0;

  for (const task of loop.tasks) {
    let enabled;
    try {
      enabled = await task.isEnabled();
    } catch (err) {
      console.error(`[continuous] không đọc được công tắc ${task.job}: ${err.message}`);
      continue;
    }
    if (!enabled) continue;
    enabledCount += 1;

    let result;
    try {
      result = task.tracked
        ? await task.run()
        : await withJobRun(task.job, TRIGGER, () => task.run(), { discardIf: task.discardIf });
    } catch (err) {
      loop.state.lastError = `${task.job}: ${err.message}`;
      console.error(`[continuous] ${task.job} lỗi: ${err.message}`);
      cooldownMs = Math.max(cooldownMs, ERROR_BACKOFF_MS);
      continue;
    }

    loop.state.lastJob = task.job;
    loop.state.lastResult = compactResult(result);
    loop.state.lastFinishedAt = new Date().toISOString();
    if (result && result.error) loop.state.lastError = `${task.job}: ${result.error}`;
    if (task.hasWork(result)) didWork = true;
    cooldownMs = Math.max(cooldownMs, task.cooldownMs ? task.cooldownMs(result) : 0);
  }

  return { didWork, cooldownMs, enabledCount };
}

function schedule(loop, delayMs) {
  loop.state.nextWakeAt = new Date(Date.now() + delayMs).toISOString();
  loop.timer = setTimeout(() => {
    tick(loop).catch((err) => console.error(`[continuous] vòng ${loop.key} thoát bất thường: ${err.message}`));
  }, delayMs);
  // Never hold the process open on its own account: the HTTP server is what
  // keeps this service alive, and a script that requires this module should
  // still be able to exit.
  if (typeof loop.timer.unref === 'function') loop.timer.unref();
}

async function tick(loop) {
  if (!loop.running) return;

  let delayMs;
  try {
    const mode = await settingsRepo.getJobMode();
    if (mode !== 'continuous') {
      // Cron is driving. Stay wired and keep asking, so flipping the mode back
      // takes effect within a minute instead of at the next restart.
      loop.state.phase = 'standby';
      delayMs = MODE_POLL_MS;
    } else {
      loop.state.phase = 'working';
      const { didWork, cooldownMs, enabledCount } = await runCycle(loop);
      loop.state.cycles += 1;
      const gaps = await settingsRepo.getContinuousGaps();
      const busyMs = gaps[loop.gapField] * 1000;
      // Nothing to do means wait the long idle gap, not the busy one: an empty
      // loop spinning every two seconds is a database query every two seconds
      // that answers "still nothing".
      delayMs = Math.max(cooldownMs, didWork ? busyMs : gaps.idleSec * 1000);
      // 'off' and 'idle' look the same from outside but mean different things:
      // every job in the loop is switched off, versus switched on with nothing
      // left to do. The dashboard needs to be able to tell those apart.
      if (enabledCount === 0) loop.state.phase = 'off';
      else loop.state.phase = cooldownMs > 0 ? 'cooling' : didWork ? 'working' : 'idle';
    }
  } catch (err) {
    console.error(`[continuous] vòng ${loop.key} lỗi: ${err.message}`);
    loop.state.lastError = err.message;
    loop.state.phase = 'cooling';
    delayMs = ERROR_BACKOFF_MS;
  }

  if (!loop.running) return;
  schedule(loop, delayMs);
}

function start() {
  for (const loop of loops) {
    if (loop.running) continue;
    loop.running = true;
    loop.state.phase = 'standby';
    schedule(loop, BOOT_DELAY_MS);
  }
  console.log(`[continuous] đã bật ${loops.length} vòng chạy (mode đọc từ setting job_mode)`);
}

function stop() {
  for (const loop of loops) {
    loop.running = false;
    if (loop.timer) clearTimeout(loop.timer);
    loop.timer = null;
    loop.state.phase = 'stopped';
    loop.state.nextWakeAt = null;
  }
}

async function getStatus() {
  let mode = null;
  let gaps = null;
  try {
    [mode, gaps] = await Promise.all([settingsRepo.getJobMode(), settingsRepo.getContinuousGaps()]);
  } catch (err) {
    return { error: err.message, loops: loops.map((l) => ({ key: l.key, label: l.label, ...l.state })) };
  }
  return {
    mode,
    gaps,
    loops: loops.map((loop) => ({
      key: loop.key,
      label: loop.label,
      jobs: loop.tasks.map((t) => t.job),
      ...loop.state,
    })),
  };
}

/**
 * True when the cron callback for `job` should do nothing because a loop is
 * already driving it. Fails open to cron: if the setting can't be read, the
 * worse outcome is one duplicated batch, not a catalogue that stops filling.
 */
async function cronIsSuppressed(job) {
  try {
    return (await settingsRepo.getJobMode()) === 'continuous';
  } catch (err) {
    console.error(`[continuous] không đọc được job_mode cho cron ${job}: ${err.message}`);
    return false;
  }
}

module.exports = { start, stop, getStatus, cronIsSuppressed, TRIGGER };
