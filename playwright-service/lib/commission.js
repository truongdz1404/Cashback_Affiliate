const { getContext, getCommissionFetchPage } = require('./browserManager');

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

/**
 * EXPERIMENTAL alternative to getCommission(): instead of page.goto()-ing to
 * the product_offer page (the dominant remaining latency cost, ~4-5s), reuse
 * an already-open, already-hydrated tab and call the API via
 * page.evaluate(fetch(...)) - same cookies/session/JS engine as a real
 * navigation, but skips the SPA boot + route render entirely. Not wired into
 * the main /commission/:pid route; exposed only via /debug for comparison.
 */
async function getCommissionViaFetch(pid) {
  if (!pid) throw new Error('pid is required');

  const page = await getCommissionFetchPage();
  const result = await page.evaluate(async (itemId) => {
    const res = await fetch(`/api/v3/offer/product?item_id=${itemId}`, {
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      body = null;
    }
    return { status: res.status, body };
  }, pid);

  return {
    pid,
    status: result.status,
    product: result.body,
    commissionTable: buildCommissionTable(result.body),
  };
}

/**
 * DIAGNOSTIC ONLY: runs the exact same (already-safe, already-in-prod)
 * navigation flow as getCommission(), but returns the *request* headers of
 * the real XHR the SPA fired instead of the parsed body. Used to compare
 * against what a manual page.evaluate(fetch(...)) sends by default, to find
 * out why getCommissionViaFetch() gets rejected (403/404) - without firing
 * any additional speculative requests at Shopee.
 */
async function getCommissionRequestHeaders(pid) {
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

    await page.goto(`https://affiliate.shopee.vn/offer/product_offer/${pid}`, {
      waitUntil: 'commit',
      timeout: 30000,
    });

    const apiResponse = await apiResponsePromise;
    if (!apiResponse) return { pid, headers: null };

    return { pid, url: apiResponse.url(), headers: apiResponse.request().headers() };
  } finally {
    await page.close();
  }
}

module.exports = { getCommission, getCommissionViaFetch, getCommissionRequestHeaders };
