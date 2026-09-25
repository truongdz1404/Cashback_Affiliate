const prisma = require('../prisma');

// Cash owed either way that has no order behind it. Today the only writer is
// withdrawal settlement (lib/repositories/withdrawalSettlement.js): entitlement
// rows are consumed whole, so the sum of the rows covering a request almost
// never equals the request exactly, and the difference has to land somewhere
// visible rather than in whoever's favour the rounding happened to fall.
// Signed: positive is owed to the user, negative is owed back to us.
async function create({ userId, amount, reason, withdrawalId = null }, tx = prisma) {
  return tx.walletAdjustment.create({
    data: {
      userId: Number(userId),
      amount,
      reason,
      withdrawalId: withdrawalId === null ? null : Number(withdrawalId),
    },
  });
}

// Feeds availableAmountForUser. Negative rows are included on purpose: an
// overpaid withdrawal reduces the balance until later earnings absorb it.
async function unpaidTotalForUser(userId, tx = prisma) {
  const result = await tx.walletAdjustment.aggregate({
    where: { userId: Number(userId), payoutStatus: 'unpaid' },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

async function listForUser(userId, { limit = 50, offset = 0 } = {}) {
  return prisma.walletAdjustment.findMany({
    where: { userId: Number(userId) },
    orderBy: { id: 'desc' },
    take: limit,
    skip: offset,
  });
}

module.exports = { create, unpaidTotalForUser, listForUser };
