const { getContext } = require('./browserManager');

/**
 * Builds the "Mạng xã hội" commission row straight from the API response's
 * named commission_rate fields, instead of scraping the on-screen table by
 * cell position. Verified against 3 live products (including two where Xtra
 * and Shopee rates differ - 2%/7% and 8%/2,5%) that:
 *   seller_commission_rate  -> "Hoa hồng Xtra" column
 *   shopee_commission_rate  -> "Hoa hồng từ Shopee" column
 * This also fixes a real bug the old DOM scrape had: when a product's Xtra
 * rate is 0%, Shopee's UI drops that table column entirely, which shifted
 * every cell after it and made the old positional read (cells[1]/cells[2])
 * report the wrong number for the (common) 0%-Xtra case.
 */
function buildCommissionTable(productData) {
  const cr = productData && productData.data && productData.data.commission_rate;
  if (!cr) return [];

  const combine = (pct, amount) => [pct, amount ? `(${amount})` : null].filter(Boolean).join(' ') || null;

  return [
    {
      channel: 'Mạng xã hội',
      xtraCommissionPct: combine(cr.seller_commission_rate, cr.seller_commission),
      shopeeCommissionPct: combine(cr.shopee_commission_rate, cr.shopee_commission),
      estimatedCommission: null,
    },
  ];
}

/**
 * Loads the product offer page for `pid` and intercepts the
 * /api/v3/offer/product?item_id=<pid> XHR the page itself fires (so it's
 * always signed correctly by the site's own JS - no header spoofing needed).
 *
 * This can't be short-circuited with a plain fetch() the way customLink.js's
 * batchCustomLink call can: the real request carries af-ac-enc-dat/
 * af-ac-enc-sz-token/x-sap-ri anti-fraud headers that Shopee's obfuscated
 * front-end JS computes fresh per page load, so a full navigation is
 * required here (confirmed empirically - see PR history).
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

    return { pid, product: productData, commissionTable: buildCommissionTable(productData) };
  } finally {
    await page.close();
  }
}

module.exports = { getCommission };
