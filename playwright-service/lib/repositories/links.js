const crypto = require('crypto');
const prisma = require('../prisma');

function generateSubId() {
  return crypto.randomBytes(5).toString('hex');
}

async function saveLink({ userId, subId, itemId, shopeeUrl, affiliateUrl }) {
  return prisma.link.create({
    data: {
      userId,
      itemId: itemId || null,
      subId,
      shopeeUrl: shopeeUrl || null,
      affiliateUrl: affiliateUrl || null,
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

module.exports = { generateSubId, saveLink, findBySubId, listByUser };
