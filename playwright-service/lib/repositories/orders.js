const prisma = require('../prisma');
const clawbackRepo = require('./clawback');

// display_order_status 3 = Cancelled. When an order Shopee previously
// reported as something else (often 2/Completed) flips to Cancelled, any
// payout already marked 'paid' can't be auto-reversed (money's already been
// bank-transferred) - it's flagged for manual review instead. Not-yet-paid
// orders are simply marked 'cancelled' so they stop counting as withdrawable.
async function upsertOrder(order, tx = prisma) {
  const data = {
    userId: order.userId ?? null,
    subId: order.subId ?? null,
    totalCommission: order.totalCommission ?? null,
    userCommission: order.userCommission ?? null,
    operatorCommission: order.operatorCommission ?? null,
    displayOrderStatus: order.displayOrderStatus ?? null,
    purchaseTime: order.purchaseTime ?? null,
    productName: order.productName ?? null,
    rawJson: order.rawJson ?? null,
  };

  const existing = await tx.order.findUnique({ where: { orderSn: order.orderSn } });
  const wasNewlyCancelled = Boolean(existing) && order.displayOrderStatus === 3 && existing.displayOrderStatus !== 3;

  if (wasNewlyCancelled && existing.payoutStatus !== 'paid') {
    data.payoutStatus = 'cancelled';
  }

  const saved = await tx.order.upsert({
    where: { orderSn: order.orderSn },
    create: { orderSn: order.orderSn, ...data },
    update: data,
  });

  if (wasNewlyCancelled && existing.payoutStatus === 'paid') {
    await clawbackRepo.flag(
      {
        userId: existing.userId,
        sourceType: 'order',
        sourceId: existing.id,
        previousPayoutStatus: existing.payoutStatus,
        amount: existing.userCommission ?? 0,
      },
      tx,
    );
  }

  return { ...saved, wasNewlyCancelled };
}

function buildWhere({ payoutStatus, displayStatus } = {}) {
  const where = {};
  if (payoutStatus) where.payoutStatus = payoutStatus;
  if (displayStatus !== undefined && displayStatus !== null && displayStatus !== '') {
    where.displayOrderStatus = Number(displayStatus);
  }
  return where;
}

// Joins in the owning user's zalo id + phone so the admin orders table can
// show who an order belongs to without a second round trip per row.
async function listOrders({ limit = 50, offset = 0, payoutStatus, displayStatus } = {}) {
  const where = buildWhere({ payoutStatus, displayStatus });
  const rows = await prisma.order.findMany({
    where,
    orderBy: { id: 'desc' },
    take: limit,
    skip: offset,
    include: { user: { select: { zaloUserId: true, phone: true } } },
  });
  return rows.map(({ user, ...order }) => ({
    ...order,
    zaloUserId: user ? user.zaloUserId : null,
    userPhone: user ? user.phone : null,
  }));
}

async function countOrders({ payoutStatus, displayStatus } = {}) {
  const where = buildWhere({ payoutStatus, displayStatus });
  return prisma.order.count({ where });
}

async function listByUser(userId, { limit = 50, offset = 0 } = {}) {
  return prisma.order.findMany({
    where: { userId: Number(userId) },
    orderBy: { id: 'desc' },
    take: limit,
    skip: offset,
  });
}

// display_order_status: 1=Pending, 2=Completed, 3=Cancelled, 4=Unpaid.
// payout_status: whether the operator has actually bank-transferred the
// user's share for a Completed order yet ('unpaid' by default, 'paid' once
// an admin marks it via PUT /admin/orders/:id/payout).
async function statsSummary() {
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE display_order_status = 2) AS "completedOrders",
      COUNT(*) FILTER (WHERE display_order_status = 1) AS "pendingOrders",
      COUNT(*) FILTER (WHERE display_order_status = 2 AND payout_status = 'paid') AS "paidOrders",
      COUNT(*) FILTER (WHERE display_order_status = 2 AND payout_status = 'unpaid') AS "unpaidOrders",
      COALESCE(SUM(total_commission) FILTER (WHERE display_order_status = 2), 0) AS "totalCommission",
      COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2), 0) AS "totalUserCommission",
      COALESCE(SUM(operator_commission) FILTER (WHERE display_order_status = 2), 0) AS "totalOperatorCommission",
      COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2 AND payout_status = 'paid'), 0) AS "totalPaidAmount",
      COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2 AND payout_status = 'unpaid'), 0) AS "totalUnpaidAmount"
    FROM orders
  `;
  return normalizeBigInts(rows[0]);
}

// Per-customer breakdown for the admin "customers" view: how many orders
// have actually been paid out to them and for how much, how many completed
// orders are still owed, and how many orders are still pending Shopee's own
// confirmation (not yet eligible for payout either way).
async function customerSummary() {
  const rows = await prisma.$queryRaw`
    SELECT
      u.id AS "userId",
      u.zalo_user_id AS "zaloUserId",
      u.phone AS "phone",
      u.bank_name AS "bankName",
      u.bank_account_number AS "bankAccountNumber",
      u.bank_account_holder AS "bankAccountHolder",
      u.commission_pct AS "commissionPct",
      COUNT(*) FILTER (WHERE o.display_order_status = 2 AND o.payout_status = 'paid') AS "paidOrders",
      COALESCE(SUM(o.user_commission) FILTER (WHERE o.display_order_status = 2 AND o.payout_status = 'paid'), 0) AS "paidAmount",
      COUNT(*) FILTER (WHERE o.display_order_status = 2 AND o.payout_status = 'unpaid') AS "unpaidOrders",
      COALESCE(SUM(o.user_commission) FILTER (WHERE o.display_order_status = 2 AND o.payout_status = 'unpaid'), 0) AS "unpaidAmount",
      COUNT(*) FILTER (WHERE o.display_order_status = 1) AS "pendingOrders"
    FROM users u
    LEFT JOIN orders o ON o.user_id = u.id
    GROUP BY u.id
    ORDER BY "unpaidAmount" DESC, u.id DESC
  `;
  return rows.map(normalizeBigInts);
}

async function setPayoutStatus(orderId, paid) {
  return prisma.order.update({
    where: { id: Number(orderId) },
    data: { payoutStatus: paid ? 'paid' : 'unpaid', paidAt: paid ? new Date().toISOString() : null },
  });
}

// Wallet tab summary for one app user: paid/unpaid totals for completed
// orders, still-pending count, and this-calendar-month paid total (for the
// "earned this month" headline number).
async function summaryForUser(userId) {
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE display_order_status = 2 AND payout_status = 'paid') AS "paidOrders",
      COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2 AND payout_status = 'paid'), 0) AS "paidAmount",
      COUNT(*) FILTER (WHERE display_order_status = 2 AND payout_status = 'unpaid') AS "unpaidOrders",
      COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2 AND payout_status = 'unpaid'), 0) AS "unpaidAmount",
      COUNT(*) FILTER (WHERE display_order_status = 1) AS "pendingOrders",
      COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 1), 0) AS "pendingAmount",
      COALESCE(SUM(user_commission) FILTER (
        WHERE display_order_status = 2 AND payout_status = 'paid'
        AND to_char(paid_at::timestamptz, 'YYYY-MM') = to_char(now(), 'YYYY-MM')
      ), 0) AS "paidThisMonth"
    FROM orders WHERE user_id = ${Number(userId)}
  `;
  return normalizeBigInts(rows[0]);
}

// $queryRaw returns COUNT(*)/integer aggregates as BigInt in node-postgres -
// convert to plain numbers so JSON.stringify (which throws on BigInt) and
// downstream arithmetic work exactly like the old better-sqlite3 numbers did.
function normalizeBigInts(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'bigint' ? Number(value) : value;
  }
  return out;
}

module.exports = {
  upsertOrder,
  listOrders,
  countOrders,
  listByUser,
  statsSummary,
  customerSummary,
  setPayoutStatus,
  summaryForUser,
};
