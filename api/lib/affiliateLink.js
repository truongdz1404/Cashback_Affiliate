// Builds a Shopee affiliate link without calling Shopee.
//
// This is a line-for-line CommonJS PORT of the React Native app's
// src/lib/affiliateLink.ts (HoanTienApp) - not a reimplementation. Its output
// was verified byte-identical to the `long_link` Shopee's own API returns for
// 12 live shop offers, and the details that make that true are easy to get
// subtly wrong: the query keys must appear in this exact order, utm_content
// always carries all five subId slots joined by "-", and a "-" inside a subId
// must become "_" or the slots shift. Change one side, change the other.
//
// The GraphQL endpoint behind Shopee's own "Lấy link" button is gated by an
// anti-bot signature we cannot replay (docs/shopee-affiliate-api-spec.txt §2),
// which is why this exists at all.

const SHOPEE_ORIGIN = 'https://shopee.vn';

/**
 * Recognises the public URL shapes a user can paste or a product feed can
 * carry: /shop/{id}, /product/{shop}/{item}, the {slug}-i.{shop}.{item}
 * permalink, and an already-tagged universal link (which we re-tag).
 *
 * @returns {{kind:'shop', shopId:string} | {kind:'product', shopId:string, itemId:string} | null}
 */
function parseShopeeUrl(raw) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  // Anchored on purpose: a bare `includes('shopee.vn')` would happily accept
  // shopee.vn.evil.com.
  if (!/(^|\.)shopee\.vn$/i.test(url.hostname)) return null;

  const path = url.pathname;

  const product = path.match(/^\/(?:universal-link\/)?product\/(\d+)\/(\d+)/);
  if (product) return { kind: 'product', shopId: product[1], itemId: product[2] };

  const permalink = path.match(/-i\.(\d+)\.(\d+)/);
  if (permalink) return { kind: 'product', shopId: permalink[1], itemId: permalink[2] };

  const shop = path.match(/^\/(?:universal-link\/)?shop\/(\d+)/);
  if (shop) return { kind: 'shop', shopId: shop[1] };

  return null;
}

// Shopee packs subId1..subId5 into utm_content joined by "-", so a sub id may
// not contain one itself or the slots shift.
function encodeSubIds(subIds) {
  return Array.from({ length: 5 }, (_, i) => (subIds[i] ?? '').replace(/-/g, '_')).join('-');
}

function buildAffiliateLink({ target, affiliateId, subIds = [], campaign = '-' }) {
  const parsed = typeof target === 'string' ? parseShopeeUrl(target) : target;
  if (!parsed) return null;

  const path =
    parsed.kind === 'product'
      ? `/universal-link/product/${parsed.shopId}/${parsed.itemId}`
      : `/universal-link/shop/${parsed.shopId}`;

  // Key order matches Shopee's own long_link so the two can be compared.
  const query = [
    ['utm_source', `an_${affiliateId}`],
    ['utm_medium', 'affiliates'],
    ['utm_campaign', campaign],
    ['utm_content', encodeSubIds(subIds)],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return `${SHOPEE_ORIGIN}${path}?${query}`;
}

module.exports = { parseShopeeUrl, buildAffiliateLink, encodeSubIds, SHOPEE_ORIGIN };
