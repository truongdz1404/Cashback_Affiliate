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
 * Fills the link textarea and the Sub_id1..Sub_id5 inputs in a single
 * page.evaluate() round trip instead of Playwright's per-field
 * locator().fill() (each of which pays a full actionability wait - visible,
 * enabled, stable, receives-events - over the CDP wire). Values are set via
 * the native value-property setter + a dispatched 'input' event, which is
 * what makes React's controlled inputs pick up the change (a plain
 * `el.value = x` does not trigger their onChange).
 *
 * Sub_id fields are located the same way the old per-field locator did -
 * find the "Sub_idN" label, take the next <input> after it in document
 * order - just resolved once in-page instead of N round trips.
 *
 * NOTE: if Shopee changes this page's markup this is the first thing to
 * re-check. Run `npx playwright codegen https://affiliate.shopee.vn/offer/custom_link`
 * (logged in, in your own browser) to inspect the live DOM and adjust the
 * label-matching below if it stops working.
 */
async function fillFormFast(page, links, subIds = {}) {
  await page.evaluate(
    ({ linksText, subIds }) => {
      function setNativeValue(el, value) {
        const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const textarea = document.querySelector('textarea');
      if (textarea) setNativeValue(textarea, linksText);

      const allInputs = Array.from(document.querySelectorAll('input'));
      const labelNodes = Array.from(document.querySelectorAll('*')).filter(
        (el) => el.children.length === 0 && /^Sub_id[1-5]$/i.test(el.textContent.trim())
      );

      for (const labelNode of labelNodes) {
        const idx = labelNode.textContent.trim().match(/[1-5]/)[0];
        const value = subIds[`sub_id${idx}`];
        if (!value) continue;
        const input = allInputs.find((inp) => labelNode.compareDocumentPosition(inp) & Node.DOCUMENT_POSITION_FOLLOWING);
        if (input) setNativeValue(input, String(value));
      }
    },
    { linksText: links.slice(0, 5).join('\n'), subIds }
  );
}

/**
 * The "Lấy link" button fires `GET /api/v3/gql?q=batchCustomLink`, whose
 * response embeds each result's `longLink` - a URL that carries a shop/item
 * id straight out of the link-generation call, for short links
 * (s.shopee.vn/shope.ee/shp.ee) included - no separate redirect-following
 * step needed. Shopee renders that id in one of a few shapes depending on
 * the product/link type:
 *   .../universal-link/<slug>-i.<shopId>.<itemId>?...
 *   .../universal-link/product/<shopId>/<itemId>?...
 *   .../universal-link/<any-slug>/<shopId>/<itemId>?...
 */
function extractShopAndItemId(longLink) {
  if (!longLink) return { shopId: null, itemId: null };
  const m = longLink.match(/i\.(\d+)\.(\d+)/) || longLink.match(/\/(\d+)\/(\d+)(?:[/?]|$)/);
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
 *
 * DISABLED as of the getCustomLinks() switch below: this is exactly the
 * kind of "bypasses Shopee's own anti-fraud tokens" traffic pattern flagged
 * as a likely contributor to the account's commission-fraud rejections
 * (every custom link for every user going out through one shared IP/session
 * via a raw fetch that deliberately skips the tokens Shopee attaches to
 * normal dashboard use). Kept here, unused, in case this turns out not to be
 * the cause and the speed tradeoff needs to be revisited.
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
  // NOTE: since the page is now reused across requests (not reloaded), a
  // slow render on this specific call could in theory surface a leftover
  // result from a previous call here - acceptable for a last-resort path
  // that's only hit when the primary API-response capture fails.
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
 * Drives the real custom_link page like a user would, so Shopee's own page
 * JS attaches whatever anti-fraud tokens it normally attaches to this
 * action - unlike getCustomLinksViaFetch() above. Uses a pooled, already
 * logged-in, already-on-the-page tab (see browserManager.js) and fills it
 * via fillFormFast() so the only real latency left is the actual network
 * round trip Shopee's page itself makes for "Lấy link" - typically a few
 * hundred ms, same order as the raw-fetch path was.
 */
async function getCustomLinksViaBrowser(links, subIds) {
  const page = await browserManager.acquireCustomLinkPage();

  try {
    if (/passport|login/i.test(page.url())) {
      throw new Error('Not logged in - call POST /login with valid cookies first.');
    }

    await fillFormFast(page, links, subIds || {});

    const responsePromise = page
      .waitForResponse((resp) => resp.url().includes('q=batchCustomLink'), { timeout: 15000 })
      .catch(() => null);

    await page.getByRole('button', { name: /Lấy link/i }).click();

    const apiResponse = await responsePromise;
    return await extractResultFromPage(page, apiResponse);
  } finally {
    await browserManager.releaseCustomLinkPage(page);
  }
}

/**
 * Generates custom affiliate links for up to 5 product URLs by driving the
 * real Shopee dashboard page (see getCustomLinksViaBrowser above).
 * @param {string[]} links product URLs, max 5 (matches the page's own limit)
 * @param {object} [subIds] e.g. { sub_id1: 'campaign_a' }
 */
async function getCustomLinks(links, subIds) {
  if (!Array.isArray(links) || links.length === 0) {
    throw new Error('links must be a non-empty array of product URLs (max 5)');
  }

  const result = await getCustomLinksViaBrowser(links, subIds);
  return { links, subIds: subIds || null, ...result };
}

module.exports = { getCustomLinks };
