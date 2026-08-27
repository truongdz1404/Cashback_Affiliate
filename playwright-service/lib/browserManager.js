const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CUSTOM_LINK_URL, COMMISSION_BOOTSTRAP_URL } = require('./constants');

const STORAGE_STATE_PATH = process.env.STORAGE_STATE_PATH || './storage/storageState.json';
const HEADLESS = process.env.HEADLESS !== 'false';
const CUSTOM_LINK_POOL_SIZE = parseInt(process.env.CUSTOM_LINK_POOL_SIZE || '2', 10);
const COMMISSION_POOL_SIZE = parseInt(process.env.COMMISSION_POOL_SIZE || '2', 10);

let browser = null;
let context = null;

// Pool of tabs already navigated (and hydrated) to the custom-link page, kept
// logged in and idle. Popping one skips the ~5-8s SPA boot sequence (app
// shell + user/profile/config calls) that a cold `page.goto()` pays every
// time. Entries are Promises so concurrent acquires don't race on a
// half-created page.
let customLinkPagePool = [];

function warmCustomLinkPage() {
  return (async () => {
    const c = await getContext();
    const page = await c.newPage();
    await page.goto(CUSTOM_LINK_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return page;
  })();
}

function refillCustomLinkPool() {
  while (customLinkPagePool.length < CUSTOM_LINK_POOL_SIZE) {
    const p = warmCustomLinkPage().catch((err) => {
      console.error('[pool] failed to warm a custom-link page:', err.message);
      return null;
    });
    customLinkPagePool.push(p);
  }
}

async function clearCustomLinkPool() {
  const pending = customLinkPagePool;
  customLinkPagePool = [];
  for (const p of pending) {
    const page = await p.catch(() => null);
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }
}

// A small set of tabs kept alive (not single-use) and already booted on the
// product_offer SPA route, so a commission lookup can try swapping pid via
// client-side routing instead of paying a full page reload's JS boot cost.
// Each slot is guarded by a lock chain so concurrent lookups round-robin
// across slots without ever fighting over the same tab.
let commissionSlots = null;
let commissionRoundRobin = -1;

function initCommissionSlots() {
  if (!commissionSlots) {
    commissionSlots = Array.from({ length: COMMISSION_POOL_SIZE }, () => ({
      pageP: null,
      lock: Promise.resolve(),
    }));
  }
  return commissionSlots;
}

async function bootCommissionPage() {
  const c = await getContext();
  const page = await c.newPage();
  await page.goto(COMMISSION_BOOTSTRAP_URL, { waitUntil: 'commit', timeout: 30000 }).catch(() => {});
  return page;
}

/**
 * Hands the caller exclusive use of one already-booted commission tab.
 * Always call the returned `release()` when done (even on error) to free
 * the slot for the next waiter.
 */
function acquireCommissionSlot() {
  const slots = initCommissionSlots();
  if (slots.length === 0) return Promise.reject(new Error('commission pool disabled'));

  commissionRoundRobin = (commissionRoundRobin + 1) % slots.length;
  const slot = slots[commissionRoundRobin];

  let releaseFn;
  const prevLock = slot.lock;
  slot.lock = new Promise((resolve) => {
    releaseFn = resolve;
  });

  return prevLock.then(async () => {
    if (!slot.pageP) slot.pageP = bootCommissionPage();
    let page = await slot.pageP.catch(() => null);
    if (!page || page.isClosed()) {
      slot.pageP = bootCommissionPage();
      page = await slot.pageP;
    }
    return { page, release: releaseFn };
  });
}

/**
 * Fires off the boot navigation for every commission slot up front (e.g. on
 * process start) so the first live request doesn't pay that cost. Safe to
 * call repeatedly - a slot that's already booted or booting is left alone.
 */
function warmCommissionSlots() {
  const slots = initCommissionSlots();
  for (const slot of slots) {
    if (!slot.pageP) slot.pageP = bootCommissionPage();
  }
}

async function clearCommissionSlots() {
  const slots = commissionSlots;
  commissionSlots = null;
  if (!slots) return;
  for (const slot of slots) {
    if (!slot.pageP) continue;
    const page = await slot.pageP.catch(() => null);
    if (page && !page.isClosed()) await page.close().catch(() => {});
  }
}

/**
 * Hands the caller an already-loaded, already-authenticated custom-link tab.
 * Falls back to a cold page if the pool is empty (e.g. right after startup
 * or a login). The pool is topped back up in the background so it doesn't
 * add latency to the caller.
 */
async function acquireCustomLinkPage() {
  let page = null;
  if (customLinkPagePool.length > 0) {
    const p = customLinkPagePool.shift();
    page = await p.catch(() => null);
    if (page && page.isClosed()) page = null;
  }
  refillCustomLinkPool();
  if (!page) page = await warmCustomLinkPage();
  return page;
}

/**
 * Normalizes cookies coming from common browser-export formats
 * (raw DevTools "Copy as cURL" cookie string, EditThisCookie JSON export,
 * or an already-Playwright-shaped array) into Playwright's addCookies() shape.
 */
function normalizeCookies(input) {
  if (typeof input === 'string') {
    // "name1=value1; name2=value2" (pasted straight from the Cookie header)
    return input
      .split(';')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf('=');
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        return { name, value, domain: '.shopee.vn', path: '/' };
      });
  }

  if (!Array.isArray(input)) {
    throw new Error('cookies must be a string ("a=1; b=2") or an array of cookie objects');
  }

  return input.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || '.shopee.vn',
    path: c.path || '/',
    // EditThisCookie/Chrome exports use `expirationDate` (seconds); Playwright wants `expires` (seconds).
    expires: c.expires ?? c.expirationDate ?? -1,
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? true,
    sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'Lax',
  }));
}

async function getBrowser() {
  if (!browser) {
    browser = await chromium.launch({ headless: HEADLESS });
  }
  return browser;
}

/**
 * Returns the shared logged-in context, restoring it from disk if the
 * process was restarted but a previous session was persisted.
 */
async function getContext() {
  if (context) return context;

  const b = await getBrowser();
  const hasStoredState = fs.existsSync(STORAGE_STATE_PATH);

  context = await b.newContext(
    hasStoredState ? { storageState: STORAGE_STATE_PATH } : {}
  );
  return context;
}

async function persistStorageState() {
  if (!context) return;
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await context.storageState({ path: STORAGE_STATE_PATH });
}

/**
 * Injects the given cookies into a fresh browser context and verifies the
 * session is actually authenticated by requesting a page that requires login.
 */
async function loginWithCookies(cookies) {
  const b = await getBrowser();

  // Start clean so stale/expired cookies from a previous session don't linger.
  await clearCustomLinkPool();
  await clearCommissionSlots();
  if (context) {
    await context.close().catch(() => {});
  }
  context = await b.newContext();
  await context.addCookies(normalizeCookies(cookies));

  const page = await context.newPage();
  await page.goto('https://affiliate.shopee.vn/offer/custom_link', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Logged-out sessions get redirected to a login/passport page.
  const url = page.url();
  const loggedIn = !/passport|login/i.test(url);

  if (!loggedIn) {
    await page.close();
    throw new Error(`Login verification failed - ended up on ${url}. Cookies are likely missing or expired.`);
  }

  await page.close();
  await persistStorageState();
  refillCustomLinkPool();
  warmCommissionSlots();
  return { loggedIn: true, url };
}

async function checkStatus() {
  const c = await getContext();
  const page = await c.newPage();
  try {
    await page.goto('https://affiliate.shopee.vn/offer/custom_link', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const loggedIn = !/passport|login/i.test(page.url());
    return { loggedIn, url: page.url() };
  } finally {
    await page.close();
  }
}

async function shutdown() {
  await clearCustomLinkPool();
  await clearCommissionSlots();
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  context = null;
  browser = null;
}

module.exports = {
  getContext,
  loginWithCookies,
  checkStatus,
  persistStorageState,
  shutdown,
  acquireCustomLinkPage,
  refillCustomLinkPool,
  acquireCommissionSlot,
  warmCommissionSlots,
};
