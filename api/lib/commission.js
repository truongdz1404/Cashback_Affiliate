const browserManager = require('./browserManager');
const { getContext } = browserManager;

const ADDLIVETAG_API_URL = 'https://data.addlivetag.com/product-data/product-data.php';
const ADDLIVETAG_BATCH_API_URL = 'https://data.addlivetag.com/product-data/product-data-batch.php';
const BATCH_MAX_ITEMS = 100;

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
// Handles both a raw number (browser path may hand back one directly) and a
// formatted VN string like "2,5%" or "₫5.100" (the API path's formatPercent/
// formatAmount output, and apparently also what Shopee's own API returns for
// the browser path) - strips the unit, then undoes VN grouping (`.` = thousands,
// `,` = decimal) before parsing.
function parseNumber(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Shopee pays the "Hoa hồng từ Shopee" (base) and "Hoa hồng Xtra" (seller
 * top-up) rates for the same order as one combined commission, not as
 * alternatives - confirmed via Shopee's own affiliate commission model help
 * article, whose worked example sums both (RM1 base + RM10 Xtra = RM11
 * total). totalPct/totalAmount below is that sum, used for the single
 * "estimated cashback" figure shown to end users.
 */
function buildCommissionTable(productData) {
  const cr = productData && productData.data && productData.data.commission_rate;
  if (!cr) return [];

  const combine = (pct, amount) => [pct, amount ? `(${amount})` : null].filter(Boolean).join(' ') || null;

  const xtraPct = parseNumber(cr.seller_commission_rate);
  const xtraAmount = parseNumber(cr.seller_commission);
  const shopeePct = parseNumber(cr.shopee_commission_rate);
  const shopeeAmount = parseNumber(cr.shopee_commission);

  return [
    {
      channel: 'Mạng xã hội',
      xtraCommissionPct: combine(cr.seller_commission_rate, cr.seller_commission),
      shopeeCommissionPct: combine(cr.shopee_commission_rate, cr.shopee_commission),
      estimatedCommission: null,
      totalPct: xtraPct === null && shopeePct === null ? null : (xtraPct || 0) + (shopeePct || 0),
      totalAmount: xtraAmount === null && shopeeAmount === null ? null : (xtraAmount || 0) + (shopeeAmount || 0),
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
// Everything addlivetag hands back beyond the commission rates - already paid
// for by this same request, so callers can snapshot it for free instead of
// having only a bare itemId to work with (see server.js /app/link,
// lib/linkTracking.js, lib/categoryEnrichment.js).
/**
 * addlivetag has never actually returned a `catName` key - verified 23/09/2026
 * against both product-data.php and product-data-batch.php, on cache hits and
 * live fetches alike. What it returns is `catPath`, the taxonomy breadcrumb
 * ordered root-first, e.g. ["Thời Trang Nữ","Áo","Áo thun"].
 *
 * The leaf is the value we want: checked against 8 rows whose category was
 * already stored, the last element matched byte-for-byte every time ("Áo thun",
 * "Rèm & Màn sáo", "Sản phẩm cạo râu & hớt tóc"...), while the root never did.
 * That also keeps this on the same granularity as Link.catName, which is what
 * the recommendation engine's category-match signal compares against.
 *
 * `info.catName` stays first in case the source ever adds the key back.
 */
function pickCatName(info) {
  if (info.catName) return info.catName;
  const path = Array.isArray(info.catPath) ? info.catPath.filter(Boolean) : [];
  return path.length ? path[path.length - 1] : null;
}

/**
 * addlivetag returns Shopee's own `shopId` alongside every product, and it was
 * being thrown away - which is why 3108 of the 4938 catalog rows had a shop
 * NAME and no shop. Reading it turns shop attribution from a guess into a fact:
 *
 *   - Free. It rides the lookup that already happens for the commission, so it
 *     costs no extra request to anyone, and nothing at all to Shopee.
 *   - Exact. lib/shopResolution.js has to search Shopee by display name and
 *     cannot separate two shops that share one; an id cannot be ambiguous.
 *   - Verified. Over 100 products, the id here matched the id Shopee's own
 *     search resolved for the same shop 100 times out of 100, with no
 *     disagreements and no missing values (23/09/2026).
 *
 * The shop-name resolution job keeps its job, but a smaller one: finding shops
 * that have no products here yet, which no product lookup can reveal.
 */
function mapInfoToMeta(info) {
  return {
    itemName: info.productName ?? null,
    catId: info.catId ?? null,
    catName: pickCatName(info),
    shopName: info.shopName ?? null,
    shopId: info.shopId == null || String(info.shopId).trim() === '' ? null : String(info.shopId).trim(),
    priceValue: parseNumber(info.price),
    imageUrl: info.imageUrl ?? null,
    isXtraCommission: typeof info.isXtra === 'boolean' ? info.isXtra : null,
  };
}

function buildResultFromInfo(info) {
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

  return {
    source: 'api',
    product: productData,
    commissionTable: buildCommissionTable(productData),
    meta: mapInfoToMeta(info),
  };
}

async function getCommissionViaApi(pid) {
  const url = `${ADDLIVETAG_API_URL}?item_id=${encodeURIComponent(pid)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`addlivetag API status ${response.status}`);

  const json = await response.json().catch(() => null);
  const info = json && json.status === 'success' && json.productInfo;
  if (!info) throw new Error('addlivetag API did not return productInfo');

  return buildResultFromInfo(info);
}

/**
 * Bulk counterpart of getCommissionViaApi, backed by addlivetag's
 * product-data-batch.php (added 22/09/2026) - purpose-built for scanning many
 * items at once instead of looping the single-item endpoint. Quota is
 * counted per product, not per request (source ~300/min, cache ~2000/min),
 * and a cache-cold item still costs source quota just like the single-item
 * endpoint would, so `maxApi` lets a caller cap how many of the (up to 100)
 * requested items may hit the live source in this one call - the docs'
 * own guidance for a cold cache is to trickle small `max_api` values rather
 * than dump a huge batch.
 *
 * Returns a Map<itemId string, { status, reason, meta, commissionTable }> so
 * callers can tell "no data at this item" (not_found/invalid) apart from
 * "not attempted this round, retry later" (skipped - api_budget_exhausted,
 * source_cooldown, etc), plus the batch-level `limits`/`summary` for
 * logging/backoff decisions.
 */
async function getCommissionBatchViaApi(pids, { maxApi } = {}) {
  const ids = (pids || []).map(String).filter(Boolean).slice(0, BATCH_MAX_ITEMS);
  if (!ids.length) return { byItemId: new Map(), summary: null, limits: null };

  const params = new URLSearchParams({ item_ids: ids.join(',') });
  if (maxApi) params.set('max_api', String(maxApi));

  const url = `${ADDLIVETAG_BATCH_API_URL}?${params.toString()}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`addlivetag batch API status ${response.status}`);

  const json = await response.json().catch(() => null);
  if (!json || json.status !== 'success' || !Array.isArray(json.products)) {
    throw new Error('addlivetag batch API did not return products');
  }

  const byItemId = new Map();
  for (const entry of json.products) {
    const itemId = entry.itemId != null ? String(entry.itemId) : String(entry.input);
    const hasUsableInfo = (entry.status === 'success' || entry.status === 'stale') && entry.productInfo;
    byItemId.set(itemId, {
      status: entry.status,
      reason: entry.reason ?? null,
      ...(hasUsableInfo ? buildResultFromInfo(entry.productInfo) : { meta: null, commissionTable: null }),
    });
  }

  return { byItemId, summary: json.summary ?? null, limits: json.limits ?? null };
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

    const apiResponse = await apiResponsePromise;
    // Only asked once the XHR failed to show up, so a healthy lookup pays
    // nothing for it. A dead session is the common reason it never fires, and
    // without this the call quietly returns an empty commission table instead
    // of saying the login expired. By now the redirect has long since
    // happened, so the wait returns immediately.
    if (!apiResponse) await browserManager.assertLoggedIn(page, 5000);
    const productData = apiResponse ? await apiResponse.json().catch(() => null) : null;

    // No addlivetag-shaped `meta` here - Shopee's own API uses a different
    // response shape we haven't mapped, and this path only runs when
    // addlivetag already failed, so it's rare in practice.
    return { source: 'browser', product: productData, commissionTable: buildCommissionTable(productData), meta: null };
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

module.exports = { getCommission, getCommissionViaApi, getCommissionBatchViaApi };
