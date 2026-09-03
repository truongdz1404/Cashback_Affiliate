const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { CUSTOM_LINK_URL } = require('./constants');

const STORAGE_STATE_PATH = process.env.STORAGE_STATE_PATH || './storage/storageState.json';
const HEADLESS = process.env.HEADLESS !== 'false';
const CUSTOM_LINK_POOL_SIZE = parseInt(process.env.CUSTOM_LINK_POOL_SIZE || '2', 10);

let browser = null;
let context = null;

// Pool of tabs already navigated (and hydrated) to the custom-link page, kept
// logged in and idle. Popping one skips the ~5-8s SPA boot sequence (app
// shell + user/profile/config calls) that a cold `page.goto()` pays every
// time. Entries are Promises so concurrent acquires don't race on a
// half-created page.
let customLinkPagePool = [];

// How many times a pooled page gets reused before it's recycled (fresh
// navigate) instead - a safety valve against unbounded DOM/memory growth from
// repeatedly rendering "Lấy link" results into the same page over hours.
const CUSTOM_LINK_PAGE_MAX_REUSE = parseInt(process.env.CUSTOM_LINK_PAGE_MAX_REUSE || '200', 10);
const customLinkPageUseCounts = new WeakMap();

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
 * Antd renders the "kết quả" dialog Shopee shows after a successful "Lấy
 * link" click (and any other popup, e.g. an announcement modal) as an
 * `.ant-modal-wrap` overlay that doesn't go away just because we've already
 * read the data out of it. Since pages are reused instead of reloaded, a
 * leftover modal mask can sit on top of the page and swallow the *next*
 * request's click on "Lấy link" - seen in production as
 * `locator.click: Timeout 30000ms exceeded ... <div class="ant-modal-wrap">
 * ... intercepts pointer events`, which made every subsequent link request on
 * that page fail outright. Click each modal's own close button first (a real
 * DOM click(), so antd's onClose handler runs and its React state actually
 * flips to closed, not just the node disappearing) then press Escape as a
 * second, independent way to ask antd to close whatever's left. Called both
 * when handing a page back to the pool and again right before the next click,
 * in case a modal reopened in between (e.g. a periodic Shopee announcement).
 */
async function dismissBlockingModals(page) {
  try {
    await page.evaluate(() => {
      document.querySelectorAll('.ant-modal-close').forEach((btn) => btn.click());
    });
    await page.keyboard.press('Escape');
  } catch (err) {
    // Best-effort only - a failed dismiss attempt shouldn't break the caller.
  }
}

/**
 * Hands a used custom-link page back to the pool instead of discarding it -
 * this is what keeps repeat requests fast (skip the ~5-8s cold navigate) once
 * the caller has moved off the fetch-bypass path and onto driving the real
 * page for every request. Clears the form fields in-place (native value
 * setter + 'input' event, so React's controlled inputs pick it up) rather
 * than reloading, which would pay the full SPA boot cost again, and dismisses
 * any leftover modal (see dismissBlockingModals) so it can't block the next
 * request's click.
 * Falls back to closing + re-warming if the reset fails or the page has been
 * reused too many times.
 */
async function releaseCustomLinkPage(page) {
  const uses = (customLinkPageUseCounts.get(page) || 0) + 1;
  customLinkPageUseCounts.set(page, uses);

  const poolIsOversized = customLinkPagePool.length >= CUSTOM_LINK_POOL_SIZE * 3;
  const canReuse = uses < CUSTOM_LINK_PAGE_MAX_REUSE && !page.isClosed() && !poolIsOversized;

  if (canReuse) {
    try {
      await dismissBlockingModals(page);
      await page.evaluate(() => {
        document.querySelectorAll('input, textarea').forEach((el) => {
          const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
          setter.call(el, '');
          el.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
      customLinkPagePool.push(Promise.resolve(page));
      return;
    } catch (err) {
      console.error('[pool] failed to reset page for reuse, discarding:', err.message);
    }
  }

  await page.close().catch(() => {});
  refillCustomLinkPool();
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
  releaseCustomLinkPage,
  refillCustomLinkPool,
  dismissBlockingModals,
};
