const settingsRepo = require('./repositories/settings');

// Per-user commission_pct (set via the admin dashboard) takes priority over
// the system-wide default; users without an override fall back to it.
async function getEffectivePct(user) {
  if (user && user.commissionPct !== null && user.commissionPct !== undefined) {
    return Number(user.commissionPct);
  }
  return settingsRepo.getCommissionPct();
}

function splitAmount(totalAmount, pct) {
  const userAmount = (totalAmount * pct) / 100;
  return { userAmount, operatorAmount: totalAmount - userAmount };
}

// Shared by the /app/link route and the Zalo bot reply: pick the "Mạng xã
// hội" row from the commission table (falling back to the first row) and
// split it by the user's effective %, so both surfaces - and whatever gets
// persisted to link history - show the exact same figure.
function estimateFromResult(result, pct) {
  const table = (result.commission && result.commission.commissionTable) || [];
  const social = table.find((r) => (r.channel || '').includes('Mạng xã hội')) || table[0] || null;
  if (!social || social.totalAmount === null || social.totalAmount === undefined) return null;

  const { userAmount } = splitAmount(social.totalAmount, pct);
  const userPct = social.totalPct === null || social.totalPct === undefined ? null : (social.totalPct * pct) / 100;
  return { userAmount, userPct };
}

module.exports = { getEffectivePct, splitAmount, estimateFromResult };

// Shopee's own numbers are the operator's business, not the shopper's. Every
// route that hands a catalogue row to a client runs it through one of these
// first: the raw rate/amount columns come off the object and only the split
// the user actually receives goes out. Stripping rather than whitelisting is
// deliberate - the five product queries behind these routes return five
// different field sets (findMany vs POOL_SELECT in ./repositories/
// recommendations.js), and a whitelist would quietly drop whichever fields a
// future query adds.
function toPublicProduct(product, pct) {
  if (!product) return null;
  const {
    commissionRateText: _rateText,
    commissionText: _text,
    commissionRateValue: rateValue,
    commissionValue: value,
    shop,
    ...rest
  } = product;
  return {
    ...rest,
    ...(shop === undefined ? {} : { shop: toPublicEmbeddedShop(shop) }),
    userCommissionRateValue: rateValue != null ? (rateValue * pct) / 100 : null,
    userCommissionValue: value != null ? (value * pct) / 100 : null,
  };
}

function toPublicProducts(products, pct) {
  return (products || []).map((p) => toPublicProduct(p, pct));
}

// The shop summary embedded in a product row (SHOP_INCLUDE) never carried a
// rate the client drew, but it carried Shopee's, so it goes the same way.
function toPublicEmbeddedShop(shop) {
  if (!shop) return shop ?? null;
  const { commissionRateText: _rateText, commissionRateValue: _rateValue, ...rest } = shop;
  return rest;
}

module.exports.toPublicProduct = toPublicProduct;
module.exports.toPublicProducts = toPublicProducts;
module.exports.toPublicEmbeddedShop = toPublicEmbeddedShop;
