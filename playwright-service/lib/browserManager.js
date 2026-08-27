const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const STORAGE_STATE_PATH = process.env.STORAGE_STATE_PATH || './storage/storageState.json';
const HEADLESS = process.env.HEADLESS !== 'false';

let browser = null;
let context = null;

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
};
