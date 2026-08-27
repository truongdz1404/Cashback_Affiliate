const { getContext } = require('./browserManager');

const CUSTOM_LINK_URL = 'https://affiliate.shopee.vn/offer/custom_link';

/**
 * Best-effort fill of the Sub_id1..Sub_id5 inputs. The dashboard is a
 * dynamic React app without stable class names, so we locate each field by
 * the visible "Sub_idN" label next to it rather than a CSS selector.
 *
 * NOTE: if Shopee changes this page's markup this is the first thing to
 * re-check. Run `npx playwright codegen https://affiliate.shopee.vn/offer/custom_link`
 * (logged in, in your own browser) to inspect the live DOM and adjust the
 * locator below if it stops matching.
 */
async function fillSubIds(page, subIds = {}) {
  for (let i = 1; i <= 5; i += 1) {
    const value = subIds[`sub_id${i}`];
    if (!value) continue;
    const field = page
      .locator(`text=/Sub_id${i}\\b/i`)
      .locator('xpath=following::input[1]')
      .first();
    if (await field.count()) {
      await field.fill(String(value)).catch(() => {});
    }
  }
}

/**
 * Extracts generated links from the result area. Primary source is whatever
 * API response the "Lấy link" click triggers (robust to DOM changes);
 * fallback is scraping visible shortened-link text/anchors from the page.
 */
async function extractResult(page, apiResponse) {
  if (apiResponse) {
    const json = await apiResponse.json().catch(() => null);
    if (json) return { source: 'api', data: json };
  }

  await page.waitForTimeout(1500);
  const scraped = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="s.shopee"], a[href*="shope.ee"]'))
      .map((a) => a.href);
    const texts = Array.from(document.querySelectorAll('*'))
      .map((el) => el.textContent && el.textContent.trim())
      .filter((t) => t && /^https?:\/\/(s\.shopee|shope\.ee)/.test(t));
    return Array.from(new Set([...anchors, ...texts]));
  });

  return { source: 'dom', data: scraped };
}

/**
 * Generates custom affiliate links for up to 5 product URLs.
 * @param {string[]} links product URLs, max 5 (matches the page's own limit)
 * @param {object} [subIds] e.g. { sub_id1: 'campaign_a' }
 */
async function getCustomLinks(links, subIds) {
  if (!Array.isArray(links) || links.length === 0) {
    throw new Error('links must be a non-empty array of product URLs (max 5)');
  }

  const context = await getContext();
  const page = await context.newPage();

  try {
    await page.goto(CUSTOM_LINK_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (/passport|login/i.test(page.url())) {
      throw new Error('Not logged in - call POST /login with valid cookies first.');
    }

    const textarea = page.locator('textarea').first();
    await textarea.fill(links.slice(0, 5).join('\n'));

    if (subIds) {
      await fillSubIds(page, subIds);
    }

    const responsePromise = page
      .waitForResponse(
        (resp) => resp.request().method() === 'POST' && /custom_link|short_link|generate/i.test(resp.url()),
        { timeout: 15000 }
      )
      .catch(() => null);

    await page.getByRole('button', { name: /Lấy link/i }).click();

    const apiResponse = await responsePromise;
    const result = await extractResult(page, apiResponse);

    return { links, subIds: subIds || null, ...result };
  } finally {
    await page.close();
  }
}

module.exports = { getCustomLinks };
