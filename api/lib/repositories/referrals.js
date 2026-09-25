const prisma = require('../prisma');
const settingsRepo = require('./settings');

// Called right after a new app user registers with a valid referral code
// (see server.js POST /app/register). referred_user_id is UNIQUE so a user
// can only ever be referred once, matching users.referred_by_user_id also
// only being settable at registration time.
async function create(referrerUserId, referredUserId) {
  const rewardAmount = await settingsRepo.getReferralReward();
  return prisma.referral.create({
    data: {
      referrerUserId: Number(referrerUserId),
      referredUserId: Number(referredUserId),
      rewardAmount,
    },
  });
}

async function findByReferredUser(referredUserId) {
  return prisma.referral.findUnique({ where: { referredUserId: Number(referredUserId) } });
}

// Called from lib/reconciliation.js right after an order upserts as
// Completed. Moves a still-pending referral to 'qualified' the first time
// the referred user completes any order - only fires once since the second
// call finds status already 'qualified' and no-ops.
//
// It also picks up a referral that qualified and was then revoked because the
// qualifying order got cancelled. The invitee completing a different order
// later is a fresh, perfectly good qualification, but the row was no longer
// 'pending' so nothing could ever move it back and the referrer lost the bonus
// for good. A bonus already paid out is deliberately not matched here: its
// payout status stays 'paid' and it is settled through a clawback flag
// instead, so this cannot hand out the same money twice.
async function qualifyIfEligible(referredUserId, orderId) {
  const referral = await prisma.referral.findFirst({
    where: {
      referredUserId: Number(referredUserId),
      OR: [{ status: 'pending' }, { status: 'qualified', payoutStatus: 'revoked' }],
    },
  });
  if (!referral) return null;

  return prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: 'qualified',
      payoutStatus: 'unpaid',
      qualifiedAt: new Date().toISOString(),
      qualifyingOrderId: orderId != null ? Number(orderId) : null,
    },
  });
}

async function unpaidTotalForReferrer(referrerUserId, tx = prisma) {
  const result = await tx.referral.aggregate({
    where: { referrerUserId: Number(referrerUserId), status: 'qualified', payoutStatus: 'unpaid' },
    _sum: { rewardAmount: true },
  });
  return result._sum.rewardAmount ?? 0;
}

async function markPaid(id) {
  return prisma.referral.update({
    where: { id: Number(id) },
    data: { payoutStatus: 'paid', paidAt: new Date().toISOString() },
  });
}

// Called when the order that qualified this referral is later reported
// Cancelled by Shopee. Money not yet paid out is simply revoked; money
// already paid can't be auto-reversed, so it's flagged for manual review
// instead (see lib/repositories/clawback.js).
async function revokeReferralForOrder(orderId, tx = prisma) {
  const referral = await tx.referral.findFirst({
    where: { qualifyingOrderId: Number(orderId), status: 'qualified' },
  });
  if (!referral) return null;

  if (referral.payoutStatus === 'paid') {
    return { referral, needsClawback: true };
  }

  const updated = await tx.referral.update({
    where: { id: referral.id },
    data: { payoutStatus: 'revoked' },
  });
  return { referral: updated, needsClawback: false };
}

async function listForReferrer(referrerUserId, { limit, offset } = {}) {
  const rows = await prisma.referral.findMany({
    where: { referrerUserId: Number(referrerUserId) },
    orderBy: { id: 'desc' },
    ...(limit !== undefined ? { take: limit } : {}),
    ...(offset !== undefined ? { skip: offset } : {}),
    include: { referred: { select: { phone: true } } },
  });
  return rows.map(({ referred, ...referral }) => ({ ...referral, referredPhone: referred.phone }));
}

// Revoked bonuses are excluded from both numbers. Filtering on `status` alone
// left a bonus that was cancelled and taken back still adding to the "Tong
// thuong" the user reads on the referral page - a figure larger than anything
// they could actually withdraw.
async function statsForReferrer(referrerUserId) {
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*) AS "totalInvited",
      COUNT(*) FILTER (WHERE status IN ('qualified', 'rewarded') AND payout_status <> 'revoked') AS "qualified",
      COALESCE(SUM(reward_amount) FILTER (WHERE status IN ('qualified', 'rewarded') AND payout_status <> 'revoked'), 0) AS "totalReward"
    FROM referrals WHERE referrer_user_id = ${Number(referrerUserId)}
  `;
  const row = rows[0];
  return {
    totalInvited: Number(row.totalInvited),
    qualified: Number(row.qualified),
    totalReward: Number(row.totalReward),
  };
}

module.exports = {
  create,
  findByReferredUser,
  qualifyIfEligible,
  listForReferrer,
  statsForReferrer,
  unpaidTotalForReferrer,
  markPaid,
  revokeReferralForOrder,
};
