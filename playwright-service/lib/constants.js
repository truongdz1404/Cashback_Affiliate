module.exports = {
  CUSTOM_LINK_URL: 'https://affiliate.shopee.vn/offer/custom_link',
  PRODUCT_OFFER_URL: 'https://affiliate.shopee.vn/offer/product_offer',
  // One shop's offer grid, inside the affiliate dashboard. NOT a link to hand
  // to a user: it needs our own affiliate login and carries no subId, so an
  // order placed through it earns nobody any cashback.
  BRAND_OFFER_URL: (shopId) => `https://affiliate.shopee.vn/offer/brand_offer/${shopId}`,
};
