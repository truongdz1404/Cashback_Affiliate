const { getContext } = require('./browserManager');

/**
 * Scrapes the visible commission table (Loại kênh / Hoa hồng Xtra /
 * Hoa hồng từ Shopee / Hoa hồng ước tính) as rendered on the page. This is a
 * supplement to the raw API payload - useful because the "ước tính" (₫)
 * column is already formatted/computed for the current price.
 *
 * NOTE: table markup has no stable class names on this dashboard. If this
 * stops returning rows, re-inspect with
 * `npx playwright codegen https://affiliate.shopee.vn/offer/product_offer/<pid>`
 * (logged in) and adjust the row/cell selector below.
 */
async function scrapeCommissionTable(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    return rows
      .map((row) => Array.from(row.querySelectorAll('td')).map((td) => td.innerText.trim()))
      .filter((cells) => cells.length >= 3)
      .map((cells) => ({
        channel: cells[0] || null,
        xtraCommissionPct: cells[1] || null,
        shopeeCommissionPct: cells[2] || null,
        estimatedCommission: cells[3] || null,
      }));
  });
}

/**
 * The table paints from React state right after the API response lands, so
 * a fixed sleep before scraping is usually much longer than needed. Poll
 * instead - most calls find rows within one or two checks - but keep a cap
 * as a safety net in case rendering is unusually slow.
 */
async function waitForCommissionTable(page, { pollMs = 150, maxMs = 1500 } = {}) {
  const start = Date.now();
  let table = await scrapeCommissionTable(page);
  while (table.length === 0 && Date.now() - start < maxMs) {
    await page.waitForTimeout(pollMs);
    table = await scrapeCommissionTable(page);
  }
  return table;
}

/**
 * Loads the product offer page for `pid`, intercepts the
 * /api/v3/offer/product?item_id=<pid> XHR the page itself fires (so it's
 * always signed correctly by the site's own JS - no header spoofing needed),
 * and combines it with the on-screen commission table.
 */
async function getCommission(pid) {
  if (!pid) throw new Error('pid is required');

  const context = await getContext();
  const page = await context.newPage();

  try {
    const apiResponsePromise = page
      .waitForResponse(
        (resp) => resp.url().includes(`/api/v3/offer/product`) && resp.url().includes(`item_id=${pid}`),
        { timeout: 20000 }
      )
      .catch(() => null);

    // 'commit' returns as soon as the (redirect-resolved) response headers
    // arrive, instead of waiting for the SPA shell to finish parsing/painting
    // - we don't need the DOM yet, just the URL (for the login check) and the
    // XHR the app fires once its JS boots, which we're already awaiting below.
    await page.goto(`https://affiliate.shopee.vn/offer/product_offer/${pid}`, {
      waitUntil: 'commit',
      timeout: 30000,
    });

    if (/passport|login/i.test(page.url())) {
      throw new Error('Not logged in - call POST /login with valid cookies first.');
    }

    const apiResponse = await apiResponsePromise;
    const productData = apiResponse ? await apiResponse.json().catch(() => null) : null;

    const commissionTable = await waitForCommissionTable(page);

    return { pid, product: productData, commissionTable };
  } finally {
    await page.close();
  }
}

module.exports = { getCommission };
