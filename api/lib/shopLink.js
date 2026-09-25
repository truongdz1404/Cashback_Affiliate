// Turns a shop row into a link we can hand a buyer.
//
// Product links are minted by driving Shopee's own "Lấy link" page through
// Playwright (lib/customLink.js). There is no shop-level equivalent of that
// page, but there does not need to be: docs/shopee-affiliate-api-spec.txt §3
// records that a shop link built from the formula below came out byte-identical
// to the `long_link` Shopee's own API returns, for 20 shops out of 20. So this
// module never touches the network, and a "Xem shop" tap is instant.
//
// The honest caveat, from spec §8: nobody has yet placed a real order through a
// self-built link and confirmed the subId shows up in the conversion report.
// Shipping it anyway is a deliberate call - a shop button that leads nowhere
// earns nothing with certainty, while this earns the operator's commission for
// sure (the affiliate id is in the link either way) and the buyer's cashback if
// attribution works as the redirect test suggests.
const { buildAffiliateLink, encodeSubIds } = require('./affiliateLink');
const { buildAnRedirLink, useAnRedir } = require('./anRedirLink');
const shopeeAffiliateApi = require('./shopeeAffiliateApi');

/**
 * Swaps our sub ids into the `long_link` Shopee itself generated for this shop.
 *
 * Preferred over rebuilding from scratch because it is exact by construction:
 * the affiliate id, the campaign and - critically - the order of the query keys
 * all stay whatever Shopee emitted, so a change on their side cannot silently
 * desync us. Only the utm_content value is rewritten, in place.
 */
function retagLongLink(longLink, subIds) {
  if (typeof longLink !== 'string') return null;
  if (!/^https:\/\/shopee\.vn\/universal-link\/shop\/\d+/.test(longLink)) return null;
  if (!/[?&]utm_content=/.test(longLink)) return null;
  return longLink.replace(/([?&]utm_content=)[^&]*/, `$1${encodeURIComponent(encodeSubIds(subIds))}`);
}

/**
 * @returns {Promise<{url: string, tracked: boolean, source: 'an_redir'|'long_link'|'built'|'plain'}>}
 *
 * `tracked` is false when the link carries no sub id - either because the
 * caller passed none (a logged-out visitor) or because we could not produce an
 * affiliate link at all and fell back to the public storefront. The caller must
 * not record a Link row in that case: reconciliation.js matches orders by
 * sub id, so a row without one can never be paid out.
 *
 * Specifically slot 0, not "any slot set". Slot 1 now carries the source
 * (lib/linkSources.js), which a guest's link has as well - and a guest link is
 * exactly the one that must NOT be recorded, since there is no user to pay.
 */
async function buildShopLink(shop, { subIds = [] } = {}) {
  const tracked = !!subIds[0];

  // The documented form, when this link falls in the rollout slice. Tried
  // first because it is the branch under test and the two below are the
  // ones already believed to work - if an_redir cannot be built we simply
  // get the old behaviour, which is the point of trying it here first.
  if (useAnRedir(subIds[0])) {
    try {
      const affiliateId = await shopeeAffiliateApi.getAffiliateId();
      const url = buildAnRedirLink({ target: { kind: 'shop', shopId: String(shop.shopId) }, affiliateId, subIds });
      if (url) return { url, tracked, source: 'an_redir' };
    } catch (err) {
      console.error(`[shop-link] an_redir không dựng được (${err.message}), dùng đường cũ.`);
    }
  }

  const retagged = retagLongLink(shop.longLink, subIds);
  if (retagged) return { url: retagged, tracked, source: 'long_link' };

  // No stored long_link (shops discovered before detail enrichment ran, or
  // created by the by-shop crawler). Build the same string ourselves. This is
  // the only branch that can reach the network, and only once every 6 hours -
  // getAffiliateId caches in memory and in the settings table.
  try {
    const affiliateId = await shopeeAffiliateApi.getAffiliateId();
    const url = buildAffiliateLink({ target: { kind: 'shop', shopId: String(shop.shopId) }, affiliateId, subIds });
    if (url) return { url, tracked, source: 'built' };
  } catch (err) {
    console.error(`[shop-link] không lấy được affiliate_id (${err.message}), rơi về link shop công khai.`);
  }

  // Last resort. Earns nobody anything, but sending the buyer to the shop
  // untracked still beats a button that does nothing - which is the whole
  // reason this fallback exists rather than an error.
  return { url: shop.shopUrl || `https://shopee.vn/shop/${encodeURIComponent(String(shop.shopId))}`, tracked: false, source: 'plain' };
}

module.exports = { buildShopLink, retagLongLink };
