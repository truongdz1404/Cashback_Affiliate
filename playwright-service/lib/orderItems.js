// Every reconciled order keeps Shopee's own report/list payload verbatim in
// orders.raw_json ({ checkout, order }). The app's order card needs the line
// items out of it - product name, thumbnail, unit price, quantity, what was
// actually paid - so this decodes that payload instead of re-querying Shopee.

// Confirmed against live orders (via /debug/report-list) by comparing against
// the affiliate dashboard's own numbers: report/list returns money fields as
// fixed-point integers scaled by 1e5 (e.g. item_price 16600000000 for a
// ₫166.000 product) - divide by this to get plain VND.
const SHOPEE_AMOUNT_SCALE = 100000;

// img_code is a storage key, not a URL. Shopee serves it from its image CDN;
// down-vn is the Vietnam edge, which is where every shopee.vn listing pulls
// its own thumbnails from.
const SHOPEE_IMAGE_BASE = 'https://down-vn.img.susercontent.com/file/';

function toVnd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n / SHOPEE_AMOUNT_SCALE;
}

// `variant` picks one of the CDN's rendition suffixes - '_tn' is the ~35KB
// thumbnail Shopee's own listings use, against ~650KB for the original, which
// matters a lot for a list of 72px images on mobile data.
function itemImageUrl(imgCode, variant = '') {
  if (!imgCode) return null;
  const code = String(imgCode).trim();
  if (!code) return null;
  // Older rows (and any future shape change) may already carry a full URL.
  if (/^https?:\/\//i.test(code)) return code;
  return `${SHOPEE_IMAGE_BASE}${code}${variant}`;
}

// shopee.vn accepts this canonical form for any listing and redirects to the
// pretty slug URL - it is the fallback target when we have no affiliate link
// of our own for the item (see resolveItemLinks in repositories/orders.js).
function itemProductUrl(shopId, itemId) {
  if (!shopId || !itemId) return null;
  return `https://shopee.vn/product/${shopId}/${itemId}`;
}

// Shopee sends the deepest non-empty category level; lv3 is the specific one
// ("Rèm cửa, màn che"), lv1 the broad one ("Nhà cửa & Đời sống").
function itemCategory(item) {
  return (
    item.global_category_lv3_name ||
    item.global_category_lv2_name ||
    item.global_category_lv1_name ||
    null
  );
}

/**
 * @returns the order's line items in the shape the app renders, or [] when the
 * raw payload is missing/unreadable (old rows reconciled before raw_json was
 * stored still have to list, just without the product details).
 */
function decodeOrderItems(rawJson) {
  if (!rawJson) return [];
  let parsed;
  try {
    parsed = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  } catch {
    return [];
  }
  const items = parsed && parsed.order && Array.isArray(parsed.order.items) ? parsed.order.items : [];
  return items.map((item) => {
    const qty = Number(item.qty) > 0 ? Number(item.qty) : 1;
    // item_price is the listed price of one unit; actual_amount is what the
    // buyer really paid for the whole line (after seller/platform discounts),
    // so the per-unit paid price has to be derived from it.
    const listPrice = toVnd(item.item_price);
    const lineAmount = toVnd(item.actual_amount);
    const paidPrice = lineAmount === null ? null : lineAmount / qty;
    return {
      itemId: item.item_id ? String(item.item_id) : null,
      modelId: item.model_id ? String(item.model_id) : null,
      shopId: item.shop_id ? String(item.shop_id) : null,
      shopName: item.shop_name || null,
      name: item.item_name || null,
      imageUrl: itemImageUrl(item.img_code),
      thumbnailUrl: itemImageUrl(item.img_code, '_tn'),
      categoryName: itemCategory(item),
      qty,
      // Shown struck through next to `price` when the two differ.
      listPrice,
      price: paidPrice,
      amount: lineAmount,
      refundedAmount: toVnd(item.refunded_amount),
      status: item.display_item_status || null,
      productUrl: itemProductUrl(item.shop_id, item.item_id),
      affiliateUrl: null,
    };
  });
}

module.exports = { SHOPEE_AMOUNT_SCALE, decodeOrderItems, itemImageUrl, itemProductUrl };
