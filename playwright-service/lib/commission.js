const { getContext } = require('./browserManager');

const ADDLIVETAG_API_URL = 'https://data.addlivetag.com/product-data/product-data.php';

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

function formatPercent(n) {
  if (n === null || n === undefined) return null;
  const s = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${s}%`;
}

function formatAmount(n) {
  if (n === null || n === undefined) return null;
  return `₫${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

/**
 * data.addlivetag.com is a third-party service that holds its own
 * authenticated Shopee affiliate session and re-exposes item_id ->
 * commission lookups over a plain, unauthenticated JSON endpoint - no
 * anti-fraud tokens needed on our side, no browser/page load required.
 * Its numbers are cached up to 24h but matched our own Playwright-sourced
 * numbers exactly on spot checks (same item_id, same rates/amounts).
 *
 * It's unofficial third-party infrastructure we don't control (could go
 * down, change shape, or return stale data), so getCommissionViaBrowser
 * below remains the fallback of record whenever this fails or returns
 * unusable data.
 */
async function getCommissionViaApi(pid) {
  const url = `${ADDLIVETAG_API_URL}?item_id=${encodeURIComponent(pid)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`addlivetag API status ${response.status}`);

  const json = await response.json().catch(() => null);
  const info = json && json.status === 'success' && json.productInfo;
  if (!info) throw new Error('addlivetag API did not return productInfo');

  const productData = {
    code: 0,
    msg: 'success',
    data: {
      item_id: String(info.itemId),
      commission_rate: {
        seller_commission_rate: formatPercent(info.sellerRatePercent),
        seller_commission: formatAmount(info.sellerComFinal),
        shopee_commission_rate: formatPercent(info.shopeeRatePercent),
        shopee_commission: formatAmount(info.shopeeComFinal),
      },
    },
  };

  return { source: 'api', product: productData, commissionTable: buildCommissionTable(productData) };
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
async function getCommissionViaBrowser(pid) {
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

    return { source: 'browser', product: productData, commissionTable: buildCommissionTable(productData) };
  } finally {
    await page.close();
  }
}

/**
 * Looks up commission info for `pid`. Tries the fast third-party API first
 * and only falls back to driving the real Shopee page if that fails (down,
 * rate-limited, unrecognized pid, shape change, etc).
 */
async function getCommission(pid) {
  if (!pid) throw new Error('pid is required');

  let result;
  try {
    result = await getCommissionViaApi(pid);
  } catch (err) {
    result = await getCommissionViaBrowser(pid);
  }

  return { pid, ...result };
}

module.exports = { getCommission };
