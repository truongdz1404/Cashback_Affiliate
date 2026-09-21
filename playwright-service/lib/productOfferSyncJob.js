// Runs runProductOfferSync in the background and tracks its status in memory,
// so callers (the admin-web "Chạy cào ngay" button, the daily cron) get an
// immediate response instead of holding a connection open for the whole
// crawl - a real problem in production, where Cloudflare's own ~100s
// upstream timeout returns its own 524 HTML error page well before a
// multi-page crawl finishes, even though the crawl itself keeps running and
// completes successfully server-side.
const { runProductOfferSync } = require('./productOfferScraper');

let state = { status: 'idle', startedAt: null, finishedAt: null, result: null, error: null };

function getStatus() {
  return { ...state };
}

// No-ops (returns the current/running state as-is) if a run is already in
// progress - runProductOfferSync drives a single shared Playwright page, so
// two overlapping runs would fight over the same browser tab.
function start(maxPages) {
  if (state.status === 'running') return getStatus();

  state = { status: 'running', startedAt: new Date().toISOString(), finishedAt: null, result: null, error: null };

  runProductOfferSync({ maxPages })
    .then((result) => {
      state = { ...state, status: 'done', finishedAt: new Date().toISOString(), result };
      console.log(`product-offer-sync: ${JSON.stringify(result)}`);
    })
    .catch((err) => {
      state = { ...state, status: 'error', finishedAt: new Date().toISOString(), error: err.message };
      console.error('product-offer-sync failed', err.message);
    });

  return getStatus();
}

module.exports = { getStatus, start };
