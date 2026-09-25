const prisma = require('../prisma');
const { maskPhone } = require('../maskPhone');
const settingsRepo = require('./settings');

// Referral programme v2 (see prisma/schema.prisma ReferralCommission): the
// referrer earns `referral_commission_pct` % of the cashback on every
// Completed order their invitee places, for `referral_commission_months`
// months after the invitee registered (0 = lifetime). The cut is funded from
// the operator's share of the Shopee commission - orders.user_commission is
// untouched, so the invitee never sees a smaller cashback because they were
// referred.

// Shopee reports purchase_time as a Unix timestamp; the column is TEXT so it
// arrives back as a numeric string. Seconds vs milliseconds is decided by
// magnitude. Anything unparsable falls back to "now" so a missing timestamp
// never silently disqualifies an order.
function orderTime(order) {
  const raw = order && order.purchaseTime;
  const n = Number(raw);
  if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(n) && n > 0) {
    return new Date(n > 1e12 ? n : n * 1000);
  }
  return new Date();
}

function withinWindow(referral, order, months) {
  if (!months || months <= 0) return true;
  const start = new Date(referral.createdAt);
  const end = new Date(start);
  end.setMonth(end.getMonth() + Number(months));
  return orderTime(order) < end;
}

// Called from lib/reconciliation.js after an order upserts as Completed
// (display_order_status 2). Idempotent: keyed on order_id, so re-processing
// the same order on a later reconcile run refreshes the amount (the referee's
// commission can be corrected by Shopee, or the admin can change the %)
// while it is still unpaid, and leaves paid rows alone.
//
// "No commission is due" and "there is a commission row to fix" are handled
// together rather than as an early return. The three reasons a commission can
// come out at nothing - the rate turned off, the order falling outside the
// referral window, Shopee revising the underlying cashback away - used to
// return before the existing row was ever looked at, so a row written earlier
// kept its stale amount and stayed withdrawable.
async function syncForCompletedOrder(order) {
  if (!order || !order.userId || !order.id) return null;
  const referral = await prisma.referral.findUnique({ where: { referredUserId: Number(order.userId) } });
  if (!referral) return null;

  const [pct, months] = await Promise.all([
    settingsRepo.getReferralCommissionPct(),
    settingsRepo.getReferralCommissionMonths(),
  ]);

  const eligible = pct > 0 && withinWindow(referral, order, months);
  const baseAmount = Number(order.userCommission) || 0;
  const amount = eligible ? Math.round((baseAmount * pct) / 100) : 0;

  const existing = await prisma.referralCommission.findUnique({ where: { orderId: Number(order.id) } });

  if (amount <= 0) {
    if (!existing) return null;
    if (existing.payoutStatus !== 'unpaid') return existing;
    return prisma.referralCommission.update({
      where: { id: existing.id },
      data: { pct, baseAmount, amount: 0, payoutStatus: 'revoked' },
    });
  }

  if (existing) {
    if (existing.payoutStatus === 'paid') return existing;
    // A revoked row becoming due again means Shopee reported this order
    // Completed after having cancelled it, the same un-cancel the order's own
    // payout status is reset for in lib/repositories/orders.js#upsertOrder.
    if (existing.amount === amount && existing.pct === pct && existing.baseAmount === baseAmount && existing.payoutStatus === 'unpaid') {
      return existing;
    }
    return prisma.referralCommission.update({
      where: { id: existing.id },
      data: { pct, baseAmount, amount, payoutStatus: 'unpaid' },
    });
  }

  return prisma.referralCommission.create({
    data: {
      referralId: referral.id,
      referrerUserId: referral.referrerUserId,
      referredUserId: referral.referredUserId,
      orderId: Number(order.id),
      pct,
      baseAmount,
      amount,
    },
  });
}

// Called inside the reconciliation transaction when the underlying order is
// newly reported Cancelled. Unpaid money is revoked outright; money already
// transferred can't be reversed automatically, so the caller flags it for
// manual review (lib/repositories/clawback.js) - same contract as
// referrals.js revokeReferralForOrder.
async function revokeForOrder(orderId, tx = prisma) {
  const commission = await tx.referralCommission.findUnique({ where: { orderId: Number(orderId) } });
  if (!commission || commission.payoutStatus === 'revoked') return null;

  if (commission.payoutStatus === 'paid') {
    return { commission, needsClawback: true };
  }

  const updated = await tx.referralCommission.update({
    where: { id: commission.id },
    data: { payoutStatus: 'revoked' },
  });
  return { commission: updated, needsClawback: false };
}

async function unpaidTotalForReferrer(referrerUserId, tx = prisma) {
  const result = await tx.referralCommission.aggregate({
    where: { referrerUserId: Number(referrerUserId), payoutStatus: 'unpaid' },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

async function markPaid(id) {
  return prisma.referralCommission.update({
    where: { id: Number(id) },
    data: { payoutStatus: 'paid', paidAt: new Date().toISOString() },
  });
}

// Lifetime earnings for the referral page header. Revoked rows are excluded
// everywhere so a cancelled order never inflates what the user sees.
async function statsForReferrer(referrerUserId) {
  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE payout_status <> 'revoked'), 0) AS "commissionTotal",
      COALESCE(SUM(amount) FILTER (WHERE payout_status = 'unpaid'), 0) AS "commissionUnpaid",
      COALESCE(SUM(amount) FILTER (WHERE payout_status = 'paid'), 0) AS "commissionPaid",
      COUNT(*) FILTER (WHERE payout_status <> 'revoked') AS "orderCount"
    FROM referral_commissions WHERE referrer_user_id = ${Number(referrerUserId)}
  `;
  const row = rows[0];
  return {
    commissionTotal: Number(row.commissionTotal),
    commissionUnpaid: Number(row.commissionUnpaid),
    commissionPaid: Number(row.commissionPaid),
    orderCount: Number(row.orderCount),
  };
}

// Per-invitee totals so the referral list can show how much each friend has
// earned the referrer so far. Returns a Map keyed by referral id.
async function totalsByReferral(referralIds) {
  const ids = (referralIds || []).map(Number).filter((n) => Number.isInteger(n));
  if (ids.length === 0) return new Map();
  const groups = await prisma.referralCommission.groupBy({
    by: ['referralId'],
    where: { referralId: { in: ids }, payoutStatus: { not: 'revoked' } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return new Map(groups.map((g) => [g.referralId, { commissionTotal: g._sum.amount ?? 0, orderCount: g._count._all }]));
}

// Recent per-order earnings for the referral page ("Lịch sử hoa hồng").
async function listForReferrer(referrerUserId, { limit = 20, offset = 0 } = {}) {
  const rows = await prisma.referralCommission.findMany({
    where: { referrerUserId: Number(referrerUserId), payoutStatus: { not: 'revoked' } },
    orderBy: { id: 'desc' },
    take: limit,
    skip: offset,
    include: {
      referral: { select: { referred: { select: { phone: true } } } },
      order: { select: { orderSn: true, productName: true, purchaseTime: true } },
    },
  });
  return rows.map(({ referral, order, referrerUserId: _referrer, referredUserId: _referred, referralId: _referralId, orderId: _orderId, ...row }) => ({
    ...row,
    referredPhone: maskPhone(referral.referred.phone),
    orderSn: order.orderSn,
    productName: order.productName,
    purchaseTime: order.purchaseTime,
  }));
}

// Admin payout queue: every commission row with who earned it and from whom.
async function listAll({ payoutStatus, limit = 100, offset = 0 } = {}) {
  const where = {};
  if (payoutStatus) where.payoutStatus = payoutStatus;
  const rows = await prisma.referralCommission.findMany({
    where,
    orderBy: { id: 'desc' },
    take: limit,
    skip: offset,
    include: {
      referrer: { select: { phone: true, email: true, fullName: true } },
      referral: { select: { referred: { select: { phone: true, email: true, fullName: true } } } },
      order: { select: { orderSn: true, productName: true, displayOrderStatus: true, payoutStatus: true } },
    },
  });
  return rows.map(({ referrer, referral, order, ...row }) => ({
    ...row,
    referrer,
    referred: referral.referred,
    order,
  }));
}

module.exports = {
  syncForCompletedOrder,
  revokeForOrder,
  unpaidTotalForReferrer,
  markPaid,
  statsForReferrer,
  totalsByReferral,
  listForReferrer,
  listAll,
};
