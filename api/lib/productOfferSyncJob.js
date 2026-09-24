// Runs runProductOfferSync in the background and tracks its status in memory,
// so callers (the client's "Chạy cào ngay" button, the daily cron) get an
// immediate response instead of holding a connection open for the whole
// crawl - a real problem in production, where Cloudflare's own ~100s
// upstream timeout returns its own 524 HTML error page well before a
// multi-page crawl finishes, even though the crawl itself keeps running and
// completes successfully server-side.
const { runProductOfferSync } = require('./productOfferScraper');
const browserJobLock = require('./browserJobLock');
const { withJobRun } = require('./jobRunner');

const JOB_NAME = 'product-offer-sync';

let state = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  result: null,
  error: null,
  // Additive fields - the four above keep their exact old shape and meaning so
  // the dashboard's existing polling keeps working untouched.
  waitingForBrowser: false,
  jobRunId: null,
};

function getStatus() {
  return { ...state };
}

// No-ops (returns the current/running state as-is) if a run is already in
// progress - runProductOfferSync drives a single shared Playwright page, so
// two overlapping runs would fight over the same browser tab.
//
// This in-memory guard is kept ALONGSIDE browserJobLock rather than replaced
// by it, because the two answer different questions. This one answers "is
// THIS job already running?", which is the idempotency contract behind the
// 202 + poll endpoints: a double-click on "Chạy cào ngay" must not queue a
// second crawl. The lock answers "is the browser busy with anything at all?",
// which is what stops this job colliding with a different browser job. Drop
// either and a bug comes back.
function start(options = {}) {
  if (state.status === 'running') return getStatus();

  const { trigger = 'admin', ...syncOptions } = options;

  state = {
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    result: null,
    error: null,
    waitingForBrowser: true,
    jobRunId: null,
  };

  // The lock is taken OUTSIDE withJobRun on purpose: a run that sits waiting
  // for another browser job would otherwise record that wait as part of its
  // own duration, and `job_runs.duration_ms` is meant to answer "how long does
  // this crawl actually take". The wait is still visible meanwhile - through
  // `waitingForBrowser` here, and by name in GET /admin/browser-lock.
  browserJobLock
    .run(JOB_NAME, () => {
      state = { ...state, waitingForBrowser: false };
      return withJobRun(JOB_NAME, trigger, ({ runId }) => {
        state = { ...state, jobRunId: runId };
        return runProductOfferSync(syncOptions);
      });
    })
    .then((result) => {
      state = { ...state, status: 'done', finishedAt: new Date().toISOString(), waitingForBrowser: false, result };
      console.log(`product-offer-sync: ${JSON.stringify(result)}`);
    })
    .catch((err) => {
      state = {
        ...state,
        status: 'error',
        finishedAt: new Date().toISOString(),
        waitingForBrowser: false,
        error: err.message,
      };
      console.error('product-offer-sync failed', err.message);
    });

  return getStatus();
}

module.exports = { getStatus, start, JOB_NAME };
