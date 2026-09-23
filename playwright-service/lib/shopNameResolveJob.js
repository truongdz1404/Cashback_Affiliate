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
function startAndWait(options = {}) {
  if (state.status === 'running') return Promise.resolve({ skipped: 'already_running' });

  const { trigger = 'admin', ...sweepOptions } = options;

  state = {
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null,
    jobRunId: null,
  };

  return withJobRun(
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
      return result;
    })
    .catch((err) => {
      state = { ...state, status: 'error', finishedAt: new Date().toISOString(), error: err.message };
      console.error('shop-name-resolve failed', err.message);
      // Resolves rather than rejects: the failure is already recorded on the
      // job_runs row and in `state`, and a caller awaiting a sweep wants to
      // know what happened, not to have to catch. Same contract as `start`,
      // which has always swallowed the rejection into state.
      return { error: err.message };
    });
}

// Fire-and-forget entry point: kicks the sweep off and answers immediately with
// the status the 202 + poll endpoints hand back.
function start(options = {}) {
  startAndWait(options);
  return getStatus();
}

module.exports = { getStatus, start, startAndWait, JOB_NAME };
