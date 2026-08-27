const browserManager = require('./browserManager');

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
 * The "Lấy link" button fires `GET /api/v3/gql?q=batchCustomLink`, whose
 * response embeds each result's `longLink` - a `.../universal-link/...-i.<shopId>.<itemId>?...`
 * URL. That's the one place a shop/item id can be read straight out of the
 * link-generation call, for short links (s.shopee.vn/shope.ee) included -
 * no separate redirect-following step needed.
 */
function extractShopAndItemId(longLink) {
  if (!longLink) return { shopId: null, itemId: null };
  const m = longLink.match(/i\.(\d+)\.(\d+)/);
  return { shopId: m ? m[1] : null, itemId: m ? m[2] : null };
}

async function extractResult(page, apiResponse) {
  if (apiResponse) {
    const json = await apiResponse.json().catch(() => null);
    const entries = json && json.data && json.data.batchCustomLink;
    if (Array.isArray(entries)) {
      const results = entries.map((e) => ({
        shortLink: e.shortLink || null,
        longLink: e.longLink || null,
        failCode: e.failCode ?? null,
        ...extractShopAndItemId(e.longLink),
      }));
      return { source: 'api', results };
    }
  }

  // Fallback: scrape whatever shortened links are visible on screen. No
  // itemId is recoverable this way, but at least the link itself isn't lost.
  await page.waitForTimeout(1500);
  const scraped = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="s.shopee"], a[href*="shope.ee"]'))
      .map((a) => a.href);
    const texts = Array.from(document.querySelectorAll('*'))
      .map((el) => el.textContent && el.textContent.trim())
      .filter((t) => t && /^https?:\/\/(s\.shopee|shope\.ee)/.test(t));
    return Array.from(new Set([...anchors, ...texts]));
  });

  return {
    source: 'dom',
    results: scraped.map((shortLink) => ({ shortLink, longLink: null, shopId: null, itemId: null, failCode: null })),
  };
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

  const page = await browserManager.acquireCustomLinkPage();

  try {
    if (/passport|login/i.test(page.url())) {
      throw new Error('Not logged in - call POST /login with valid cookies first.');
    }

    const textarea = page.locator('textarea').first();
    await textarea.fill(links.slice(0, 5).join('\n'));

    if (subIds) {
      await fillSubIds(page, subIds);
    }

    const responsePromise = page
      .waitForResponse((resp) => resp.url().includes('q=batchCustomLink'), { timeout: 15000 })
      .catch(() => null);

    await page.getByRole('button', { name: /Lấy link/i }).click();

    const apiResponse = await responsePromise;
    const result = await extractResult(page, apiResponse);

    return { links, subIds: subIds || null, ...result };
  } finally {
    // Single-use tab: pooled pages are meant to be consumed once (the
    // textarea/result state doesn't reset cleanly for reuse). Closing it and
    // letting the pool top itself back up in the background keeps the next
    // caller fast too.
    await page.close().catch(() => {});
    browserManager.refillCustomLinkPool();
  }
}

module.exports = { getCustomLinks };
