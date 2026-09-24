const crypto = require('crypto');
const prisma = require('../prisma');

function generateSubId() {
  return crypto.randomBytes(5).toString('hex');
}

async function saveLink({
  userId,
  subId,
  itemId,
  shopeeUrl,
  affiliateUrl,
  estimatedAmount,
  estimatedPct,
  itemName,
  catId,
  catName,
  shopName,
  shopId,
  priceValue,
  imageUrl,
  source,
}) {
  return prisma.link.create({
    data: {
      userId,
      itemId: itemId || null,
      subId,
      shopeeUrl: shopeeUrl || null,
      affiliateUrl: affiliateUrl || null,
      estimatedAmount: estimatedAmount ?? null,
      estimatedPct: estimatedPct ?? null,
      itemName: itemName || null,
      catId: catId ?? null,
      catName: catName || null,
      shopName: shopName || null,
      shopId: shopId || null,
      priceValue: priceValue ?? null,
      imageUrl: imageUrl || null,
      source: source || null,
    },
  });
}

async function findBySubId(subId) {
  return prisma.link.findUnique({ where: { subId } });
}

// Backs the app's "Hoàn tiền" history list - most recent first.
async function listByUser(userId, { limit = 20, offset = 0 } = {}) {
  return prisma.link.findMany({
    where: { userId: Number(userId) },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });
}

// Lets the Shopping-tab "open product" route skip re-generating a custom
// link (a real Shopee/Playwright round trip - see customLink.js) when this
// user already has one for this item within maxAgeMs. Re-tapping/re-opening
// the same product shouldn't multiply calls to Shopee's custom_link page.
async function findRecentByUserAndItem(userId, itemId, maxAgeMs) {
  if (!itemId) return null;
  return prisma.link.findFirst({
    where: {
      userId: Number(userId),
      itemId: String(itemId),
      createdAt: { gte: new Date(Date.now() - maxAgeMs) },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// Shop links have no itemId to key on, so reuse is keyed on the storefront URL
// instead. Unlike the product case above this saves no Shopee round trip -
// building a shop link is pure string work (lib/shopLink.js) - it only stops a
// user who taps the same shop ten times from leaving ten rows behind, each with
// its own sub id, in the table reconciliation reads.
async function findRecentByUserAndShopeeUrl(userId, shopeeUrl, maxAgeMs) {
  if (!shopeeUrl) return null;
  return prisma.link.findFirst({
    where: {
      userId: Number(userId),
      shopeeUrl: String(shopeeUrl),
      createdAt: { gte: new Date(Date.now() - maxAgeMs) },
    },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = {
  generateSubId,
  saveLink,
  findBySubId,
  listByUser,
  findRecentByUserAndItem,
  findRecentByUserAndShopeeUrl,
};
