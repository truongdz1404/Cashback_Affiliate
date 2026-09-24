// Where a link was minted from.
//
// One vocabulary doing three jobs, which is exactly why it lives in one file
// rather than as literals at each call site:
//   1. it is stored on the link row, so "which surface do people actually use"
//      is one GROUP BY away the moment anyone asks;
//   2. it rides to Shopee as subId2, so the same label comes back in the
//      conversion report and answers the harder question - which surface
//      produces orders, not just taps;
//   3. the app sends it as an event parameter under the same names, so the
//      Firebase funnel and the database agree on what a "source" is.
//
// Short and ASCII on purpose. Shopee packs subId1..subId5 into utm_content
// joined by "-", so a value containing "-" gets rewritten to "_"
// (see encodeSubIds in affiliateLink.js) and a long one only makes the URL
// longer for nothing.
const LINK_SOURCES = Object.freeze({
  // The "Tạo link" screen: the user pasted a Shopee URL.
  PASTE: 'paste',
  // A product card, by the screen it was tapped on. Split rather than a single
  // "card" because the whole point of the suggestions feed is to be worth more
  // than the plain catalogue, and that claim is only testable if the two are
  // counted apart.
  HOME: 'home',
  SHOPPING: 'shopping',
  SHOPDETAIL: 'shopdetail',
  // Tapped a shop and got sent to its storefront - no product chosen yet.
  SHOPFRONT: 'shopfront',
  // The Zalo bot, which predates the app entirely.
  ZALO: 'zalo',
});

const PRODUCT_TAP_SOURCES = new Set([LINK_SOURCES.HOME, LINK_SOURCES.SHOPPING, LINK_SOURCES.SHOPDETAIL]);

/**
 * The screen name comes from the client, and this string ends up inside a URL
 * we hand to Shopee - so it is checked against the list above rather than
 * trusted.
 *
 * An unrecognised value falls back to a valid source instead of being dropped:
 * a link labelled a little too coarsely still reconciles and still pays the
 * user, whereas one with no source at all would be invisible in exactly the
 * report this exists to produce. Old app builds that send nothing land here too.
 */
function productTapSource(value) {
  return PRODUCT_TAP_SOURCES.has(value) ? value : LINK_SOURCES.SHOPPING;
}

module.exports = { LINK_SOURCES, productTapSource };
