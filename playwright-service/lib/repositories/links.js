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
  priceValue,
  imageUrl,
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
      priceValue: priceValue ?? null,
      imageUrl: imageUrl || null,
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

module.exports = { generateSubId, saveLink, findBySubId, listByUser, findRecentByUserAndItem };
