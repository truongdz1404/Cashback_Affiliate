const prisma = require('../prisma');
const adjustmentsRepo = require('./walletAdjustments');
const campaignsRepo = require('./campaigns');

// Money is stored in double precision (see the Float columns in
// prisma/schema.prisma), so "did these rows cover the request exactly" can
// never be an equality test. Half a dong is far below anything that can be
// transferred and comfortably above the representation error.
const EPSILON = 0.5;

// The four things a cashback balance is made of, plus the adjustment ledger,
// each described the same way: how to list one user's still-unpaid rows
// oldest-first, what the row is worth, and how to stamp it paid. Adjustments
// come first so an earlier credit is used up before fresh earnings are.
const SOURCES = [
  {
    type: 'adjustment',
    list: (tx, userId) =>
      tx.walletAdjustment.findMany({
        where: { userId, payoutStatus: 'unpaid' },
        orderBy: { id: 'asc' },
        select: { id: true, amount: true },
      }),
    amountOf: (row) => row.amount ?? 0,
    markPaid: (tx, id, paidAt) =>
      tx.walletAdjustment.update({ where: { id }, data: { payoutStatus: 'paid', paidAt } }),
  },
  {
    type: 'order',
    list: (tx, userId) =>
      tx.order.findMany({
        where: { userId, displayOrderStatus: 2, payoutStatus: 'unpaid' },
        orderBy: { id: 'asc' },
        select: { id: true, userCommission: true },
      }),
    amountOf: (row) => row.userCommission ?? 0,
    markPaid: (tx, id, paidAt) =>
      tx.order.update({ where: { id }, data: { payoutStatus: 'paid', paidAt } }),
  },
  {
    type: 'referral',
    list: (tx, userId) =>
      tx.referral.findMany({
        where: { referrerUserId: userId, status: 'qualified', payoutStatus: 'unpaid' },
        orderBy: { id: 'asc' },
        select: { id: true, rewardAmount: true },
      }),
    amountOf: (row) => row.rewardAmount ?? 0,
    markPaid: (tx, id, paidAt) =>
      tx.referral.update({ where: { id }, data: { payoutStatus: 'paid', paidAt } }),
  },
  {
    type: 'referralCommission',
    list: (tx, userId) =>
      tx.referralCommission.findMany({
        where: { referrerUserId: userId, payoutStatus: 'unpaid' },
        orderBy: { id: 'asc' },
        select: { id: true, amount: true },
      }),
    amountOf: (row) => row.amount ?? 0,
    markPaid: (tx, id, paidAt) =>
      tx.referralCommission.update({ where: { id }, data: { payoutStatus: 'paid', paidAt } }),
  },
  {
    type: 'campaignReward',
    list: (tx, userId) =>
      tx.campaignReward.findMany({
        where: { userId, payoutStatus: 'unpaid' },
        orderBy: { id: 'asc' },
        select: { id: true, rewardAmount: true },
      }),
    amountOf: (row) => row.rewardAmount ?? 0,
    markPaid: (tx, id, paidAt) =>
      tx.campaignReward.update({ where: { id }, data: { payoutStatus: 'paid', paidAt } }),
  },
];

// Marks the request's cash amount as settled against this user's own unpaid
// entitlement rows, and records which rows in withdrawal_items. Called from
// withdrawals.setStatus inside the transaction that flips the request to
// 'paid', which is the whole point: before this, the reserve was released the
// instant the admin clicked "da thanh toan" while the rows behind it stayed
// unpaid until they were clicked one by one, so every row missed was money the
// user could withdraw again.
//
// Rows are consumed whole and oldest-first, so the last one usually overshoots.
// The overshoot is credited straight back as a wallet adjustment; the opposite
// case - entitlements shrinking between approval and payout, leaving less than
// the request - is written as a negative one and comes off future earnings.
async function settleWithdrawal(withdrawal, tx = prisma) {
  const target = Number(withdrawal.amount) || 0;
  const userId = Number(withdrawal.userId);
  const paidAt = new Date().toISOString();

  let settled = 0;
  const items = [];

  if (target > 0) {
    for (const source of SOURCES) {
      if (settled >= target - EPSILON) break;
      const rows = await source.list(tx, userId);
      for (const row of rows) {
        if (settled >= target - EPSILON) break;
        const amount = source.amountOf(row);
        // Negative adjustments are debts, not something a payout can consume;
        // they keep reducing the balance until earnings absorb them.
        if (!(amount > 0)) continue;

        await source.markPaid(tx, row.id, paidAt);
        await tx.withdrawalItem.create({
          data: { withdrawalId: withdrawal.id, sourceType: source.type, sourceId: row.id, amount },
        });
        settled += amount;
        items.push({ sourceType: source.type, sourceId: row.id, amount });
      }
    }
  }

  const difference = settled - target;
  if (Math.abs(difference) > EPSILON) {
    await adjustmentsRepo.create(
      {
        userId,
        amount: difference,
        reason:
          difference > 0
            ? `Du ra khi tat toan lenh rut #${withdrawal.id}`
            : `Thieu hut khi tat toan lenh rut #${withdrawal.id}`,
        withdrawalId: withdrawal.id,
      },
      tx,
    );
  }

  // Campaign tiers are measured in commission already paid out, so settling
  // these orders is exactly the moment a new tier can be reached.
  await campaignsRepo.grantRewardsForUser(userId, tx);

  return { settled, difference, items };
}

module.exports = { settleWithdrawal, EPSILON };
