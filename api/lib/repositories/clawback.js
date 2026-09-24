const prisma = require('../prisma');

// Money already marked 'paid' (order payout, referral, or campaign reward)
// can't be auto-reversed once Shopee reports the underlying order Cancelled -
// this just records the fact for an admin to review and settle manually.
async function flag({ userId, sourceType, sourceId, previousPayoutStatus, amount }, tx = prisma) {
  if (userId == null) return null;
  return tx.clawbackFlag.create({
    data: {
      userId: Number(userId),
      sourceType,
      sourceId: Number(sourceId),
      previousPayoutStatus,
      amount: amount ?? 0,
    },
  });
}

async function listOpen() {
  return prisma.clawbackFlag.findMany({
    where: { resolvedAt: null },
    orderBy: { id: 'desc' },
    include: { user: { select: { phone: true } } },
  });
}

async function resolve(id, { resolvedBy, note } = {}) {
  return prisma.clawbackFlag.update({
    where: { id: Number(id) },
    data: { resolvedAt: new Date().toISOString(), resolvedBy: resolvedBy ?? null, note: note ?? null },
  });
}

module.exports = { flag, listOpen, resolve };
