const browserManager = require('./browserManager');

const BATCH_CUSTOM_LINK_URL = 'https://affiliate.shopee.vn/api/v3/gql?q=batchCustomLink';
const BATCH_CUSTOM_LINK_QUERY = `
  query batchGetCustomLink($linkParams: [CustomLinkParam!], $sourceCaller: SourceCaller) {
    batchCustomLink(linkParams: $linkParams, sourceCaller: $sourceCaller) {
      shortLink
      longLink
      failCode
    }
  }
`;

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
 * response embeds each result's `longLink` - a URL that carries a shop/item
 * id straight out of the link-generation call, for short links
 * (s.shopee.vn/shope.ee) included - no separate redirect-following step
 * needed. Shopee renders that id in one of two shapes depending on the
 * product/link type:
 *   .../universal-link/<slug>-i.<shopId>.<itemId>?...
 *   .../universal-link/product/<shopId>/<itemId>?...
 */
function extractShopAndItemId(longLink) {
  if (!longLink) return { shopId: null, itemId: null };
  const m = longLink.match(/i\.(\d+)\.(\d+)/) || longLink.match(/\/product\/(\d+)\/(\d+)/);
  return { shopId: m ? m[1] : null, itemId: m ? m[2] : null };
}

function toResults(entries) {
  return entries.map((e) => ({
    shortLink: e.shortLink || null,
    longLink: e.longLink || null,
    failCode: e.failCode ?? null,
    ...extractShopAndItemId(e.longLink),
  }));
}

function buildBatchCustomLinkPayload(links, subIds = {}) {
  return {
    operationName: 'batchGetCustomLink',
    query: BATCH_CUSTOM_LINK_QUERY,
    variables: {
      linkParams: links.slice(0, 5).map((link) => ({
        originalLink: link,
        advancedLinkParams: {
          subId1: subIds.sub_id1 || '',
          subId2: subIds.sub_id2 || '',
          subId3: subIds.sub_id3 || '',
          subId4: subIds.sub_id4 || '',
          subId5: subIds.sub_id5 || '',
        },
      })),
      sourceCaller: 'CUSTOM_LINK_CALLER',
    },
  };
}

/**
 * batchCustomLink turns out not to require the af-ac-enc-* / x-sap-ri
 * anti-fraud tokens that lib/commission.js's product-offer lookup needs
 * (confirmed empirically: a plain fetch with just the session cookies
 * consistently returns 200) - so link generation can skip the browser
 * entirely and hit the GraphQL endpoint directly. This takes ~100-450ms
 * versus the ~2-6s the Playwright/pool path pays for a full page load +
 * button click + DOM wait.
 */
async function getCustomLinksViaFetch(links, subIds) {
  const context = await browserManager.getContext();
  const cookies = await context.cookies();
  const cookieHeader = cookies
    .filter((c) => /shopee/i.test(c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const response = await fetch(BATCH_CUSTOM_LINK_URL, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'content-type': 'application/json',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      'sec-fetch-dest': 'empty',
      'sec-fetch-site': 'same-origin',
      'sec-ch-ua': '"Google Chrome";v="133", "Chromium";v="133", "Not)A;Brand";v="24"',
      cookie: cookieHeader,
    },
    body: JSON.stringify(buildBatchCustomLinkPayload(links, subIds)),
  });

  const json = await response.json().catch(() => null);
  const entries = json && json.data && json.data.batchCustomLink;
  if (!Array.isArray(entries)) {
    throw new Error(`batchCustomLink fetch did not return usable data (status ${response.status})`);
  }

  return { source: 'fetch', results: toResults(entries) };
}

async function extractResultFromPage(page, apiResponse) {
  if (apiResponse) {
    const json = await apiResponse.json().catch(() => null);
    const entries = json && json.data && json.data.batchCustomLink;
    if (Array.isArray(entries)) {
      return { source: 'api', results: toResults(entries) };
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
 * Fallback path: drives the real custom_link page like a user would. Used
 * only when getCustomLinksViaFetch() fails (e.g. Shopee starts requiring
 * anti-fraud headers here too, or the session cookies are stale) so a
 * transient issue with the fast path doesn't take the feature down.
 */
async function getCustomLinksViaBrowser(links, subIds) {
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
    return await extractResultFromPage(page, apiResponse);
  } finally {
    // Single-use tab: pooled pages are meant to be consumed once (the
    // textarea/result state doesn't reset cleanly for reuse). Closing it and
    // letting the pool top itself back up in the background keeps the next
    // caller fast too.
    await page.close().catch(() => {});
    browserManager.refillCustomLinkPool();
  }
}

/**
 * Generates custom affiliate links for up to 5 product URLs. Tries the fast
 * direct-fetch path first and only falls back to driving the real page if
 * that fails.
 * @param {string[]} links product URLs, max 5 (matches the page's own limit)
 * @param {object} [subIds] e.g. { sub_id1: 'campaign_a' }
 */
async function getCustomLinks(links, subIds) {
  if (!Array.isArray(links) || links.length === 0) {
    throw new Error('links must be a non-empty array of product URLs (max 5)');
  }

  let result;
  try {
    result = await getCustomLinksViaFetch(links, subIds);
  } catch (err) {
    result = await getCustomLinksViaBrowser(links, subIds);
  }

  return { links, subIds: subIds || null, ...result };
}

module.exports = { getCustomLinks };
