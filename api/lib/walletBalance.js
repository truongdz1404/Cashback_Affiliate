const prisma = require('./prisma');
const ordersRepo = require('./repositories/orders');
const referralsRepo = require('./repositories/referrals');
const referralCommissionsRepo = require('./repositories/referralCommissions');
const campaignsRepo = require('./repositories/campaigns');
const withdrawalsRepo = require('./repositories/withdrawals');
const adjustmentsRepo = require('./repositories/walletAdjustments');

// Shared by server.js (GET /app/wallet) and worker/withdrawalWorker.js (the
// balance re-check before creating a withdrawal request) so the definition
// of "withdrawable balance" can't drift between the two call sites: unpaid
// order commissions, plus qualified-but-unpaid referral bonuses, unpaid
// per-order referral commissions, campaign-tier rewards and the signed
// settlement adjustments, minus whatever is already reserved by an open
// (pending/approved) withdrawal request.
//
// Queries run one after another rather than in parallel because the worker
// passes its own transaction client in: this has to read the same locked
// snapshot it is about to write, which it did not before - it read through the
// global client while sitting inside the advisory lock.
async function availableAmountForUser(userId, tx = prisma) {
  const summary = await ordersRepo.summaryForUser(userId, tx);
  const referralBonusUnpaid = await referralsRepo.unpaidTotalForReferrer(userId, tx);
  const referralCommissionUnpaid = await referralCommissionsRepo.unpaidTotalForReferrer(userId, tx);
  const campaignUnpaid = await campaignsRepo.unpaidTotalForUser(userId, tx);
  const adjustmentUnpaid = await adjustmentsRepo.unpaidTotalForUser(userId, tx);
  const reservedTotal = await withdrawalsRepo.pendingTotalForUser(userId, tx);

  const referralUnpaid = referralBonusUnpaid + referralCommissionUnpaid;
  const available =
    summary.unpaidAmount + referralUnpaid + campaignUnpaid + adjustmentUnpaid - reservedTotal;
  return {
    summary,
    referralUnpaid,
    referralBonusUnpaid,
    referralCommissionUnpaid,
    campaignUnpaid,
    adjustmentUnpaid,
    reservedTotal,
    available: Math.max(available, 0),
  };
}

module.exports = { availableAmountForUser };
