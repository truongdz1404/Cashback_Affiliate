const ordersRepo = require('./repositories/orders');
const referralsRepo = require('./repositories/referrals');
const referralCommissionsRepo = require('./repositories/referralCommissions');
const campaignsRepo = require('./repositories/campaigns');
const withdrawalsRepo = require('./repositories/withdrawals');

// Shared by server.js (GET /app/wallet) and worker/withdrawalWorker.js (the
// balance re-check before creating a withdrawal request) so the definition
// of "withdrawable balance" can't drift between the two call sites: paid
// order commissions, plus qualified-but-unpaid referral bonuses, unpaid
// per-order referral commissions and campaign-tier rewards, minus whatever
// is already reserved by an open (pending/approved) withdrawal request.
async function availableAmountForUser(userId) {
  const [summary, referralBonusUnpaid, referralCommissionUnpaid, campaignUnpaid, reservedTotal] = await Promise.all([
    ordersRepo.summaryForUser(userId),
    referralsRepo.unpaidTotalForReferrer(userId),
    referralCommissionsRepo.unpaidTotalForReferrer(userId),
    campaignsRepo.unpaidTotalForUser(userId),
    withdrawalsRepo.pendingTotalForUser(userId),
  ]);
  const referralUnpaid = referralBonusUnpaid + referralCommissionUnpaid;
  const available = summary.unpaidAmount + referralUnpaid + campaignUnpaid - reservedTotal;
  return {
    summary,
    referralUnpaid,
    referralBonusUnpaid,
    referralCommissionUnpaid,
    campaignUnpaid,
    reservedTotal,
    available: Math.max(available, 0),
  };
}

module.exports = { availableAmountForUser };
