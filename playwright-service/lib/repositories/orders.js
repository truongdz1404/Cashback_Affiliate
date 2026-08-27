const db = require('../db');
const { toCamel, toCamelList } = require('../camelize');

function upsertOrder(order) {
  db.prepare(
    `INSERT INTO orders (order_sn, user_id, sub_id, total_commission, user_commission, operator_commission, display_order_status, purchase_time, raw_json, updated_at)
     VALUES (@orderSn, @userId, @subId, @totalCommission, @userCommission, @operatorCommission, @displayOrderStatus, @purchaseTime, @rawJson, datetime('now'))
     ON CONFLICT(order_sn) DO UPDATE SET
       user_id = excluded.user_id,
       sub_id = excluded.sub_id,
       total_commission = excluded.total_commission,
       user_commission = excluded.user_commission,
       operator_commission = excluded.operator_commission,
       display_order_status = excluded.display_order_status,
       purchase_time = excluded.purchase_time,
       raw_json = excluded.raw_json,
       updated_at = datetime('now')`
  ).run({
    orderSn: order.orderSn,
    userId: order.userId ?? null,
    subId: order.subId ?? null,
    totalCommission: order.totalCommission ?? null,
    userCommission: order.userCommission ?? null,
    operatorCommission: order.operatorCommission ?? null,
    displayOrderStatus: order.displayOrderStatus ?? null,
    purchaseTime: order.purchaseTime ?? null,
    rawJson: order.rawJson ?? null,
  });
  return toCamel(db.prepare('SELECT * FROM orders WHERE order_sn = ?').get(order.orderSn));
}

function buildWhere({ payoutStatus, displayStatus } = {}) {
  const conditions = [];
  const params = {};
  if (payoutStatus) {
    conditions.push('o.payout_status = @payoutStatus');
    params.payoutStatus = payoutStatus;
  }
  if (displayStatus !== undefined && displayStatus !== null && displayStatus !== '') {
    conditions.push('o.display_order_status = @displayStatus');
    params.displayStatus = Number(displayStatus);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

// Joins in the owning user's zalo id + phone so the admin orders table can
// show who an order belongs to without a second round trip per row.
function listOrders({ limit = 50, offset = 0, payoutStatus, displayStatus } = {}) {
  const { where, params } = buildWhere({ payoutStatus, displayStatus });
  return toCamelList(
    db
      .prepare(
        `SELECT o.*, u.zalo_user_id AS zaloUserId, u.phone AS userPhone
         FROM orders o LEFT JOIN users u ON u.id = o.user_id
         ${where}
         ORDER BY o.id DESC LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset })
  );
}

function countOrders({ payoutStatus, displayStatus } = {}) {
  const { where, params } = buildWhere({ payoutStatus, displayStatus });
  return db.prepare(`SELECT COUNT(*) AS n FROM orders o ${where}`).get(params).n;
}

function listByUser(userId, { limit = 50, offset = 0 } = {}) {
  return toCamelList(
    db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?').all(userId, limit, offset)
  );
}

// display_order_status: 1=Pending, 2=Completed, 3=Cancelled, 4=Unpaid.
// payout_status: whether the operator has actually bank-transferred the
// user's share for a Completed order yet ('unpaid' by default, 'paid' once
// an admin marks it via PUT /admin/orders/:id/payout).
function statsSummary() {
  return db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE display_order_status = 2) AS completedOrders,
         COUNT(*) FILTER (WHERE display_order_status = 1) AS pendingOrders,
         COUNT(*) FILTER (WHERE display_order_status = 2 AND payout_status = 'paid') AS paidOrders,
         COUNT(*) FILTER (WHERE display_order_status = 2 AND payout_status = 'unpaid') AS unpaidOrders,
         COALESCE(SUM(total_commission) FILTER (WHERE display_order_status = 2), 0) AS totalCommission,
         COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2), 0) AS totalUserCommission,
         COALESCE(SUM(operator_commission) FILTER (WHERE display_order_status = 2), 0) AS totalOperatorCommission,
         COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2 AND payout_status = 'paid'), 0) AS totalPaidAmount,
         COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2 AND payout_status = 'unpaid'), 0) AS totalUnpaidAmount
       FROM orders`
    )
    .get();
}

// Per-customer breakdown for the admin "customers" view: how many orders
// have actually been paid out to them and for how much, how many completed
// orders are still owed, and how many orders are still pending Shopee's own
// confirmation (not yet eligible for payout either way).
function customerSummary() {
  return db
    .prepare(
      `SELECT
         u.id AS userId,
         u.zalo_user_id AS zaloUserId,
         u.phone AS phone,
         u.bank_name AS bankName,
         u.bank_account_number AS bankAccountNumber,
         u.bank_account_holder AS bankAccountHolder,
         u.commission_pct AS commissionPct,
         COUNT(*) FILTER (WHERE o.display_order_status = 2 AND o.payout_status = 'paid') AS paidOrders,
         COALESCE(SUM(o.user_commission) FILTER (WHERE o.display_order_status = 2 AND o.payout_status = 'paid'), 0) AS paidAmount,
         COUNT(*) FILTER (WHERE o.display_order_status = 2 AND o.payout_status = 'unpaid') AS unpaidOrders,
         COALESCE(SUM(o.user_commission) FILTER (WHERE o.display_order_status = 2 AND o.payout_status = 'unpaid'), 0) AS unpaidAmount,
         COUNT(*) FILTER (WHERE o.display_order_status = 1) AS pendingOrders
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       GROUP BY u.id
       ORDER BY unpaidAmount DESC, u.id DESC`
    )
    .all();
}

function setPayoutStatus(orderId, paid) {
  db.prepare(
    "UPDATE orders SET payout_status = ?, paid_at = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(paid ? 'paid' : 'unpaid', paid ? new Date().toISOString() : null, orderId);
  return toCamel(db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId));
}

// Wallet tab summary for one app user: paid/unpaid totals for completed
// orders, still-pending count, and this-calendar-month paid total (for the
// "earned this month" headline number).
function summaryForUser(userId) {
  return db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE display_order_status = 2 AND payout_status = 'paid') AS paidOrders,
         COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2 AND payout_status = 'paid'), 0) AS paidAmount,
         COUNT(*) FILTER (WHERE display_order_status = 2 AND payout_status = 'unpaid') AS unpaidOrders,
         COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2 AND payout_status = 'unpaid'), 0) AS unpaidAmount,
         COUNT(*) FILTER (WHERE display_order_status = 1) AS pendingOrders,
         COALESCE(SUM(user_commission) FILTER (
           WHERE display_order_status = 2 AND payout_status = 'paid'
           AND strftime('%Y-%m', paid_at) = strftime('%Y-%m', 'now')
         ), 0) AS paidThisMonth
       FROM orders WHERE user_id = ?`
    )
    .get(userId);
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
