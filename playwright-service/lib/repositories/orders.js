const db = require('../db');

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
  return db.prepare('SELECT * FROM orders WHERE order_sn = ?').get(order.orderSn);
}

function listOrders({ limit = 50, offset = 0 } = {}) {
  return db
    .prepare('SELECT * FROM orders ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(limit, offset);
}

function countOrders() {
  return db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
}

// display_order_status: 1=Pending, 2=Completed, 3=Cancelled, 4=Unpaid.
function statsSummary() {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) FILTER (WHERE display_order_status = 2) AS completedOrders,
         COALESCE(SUM(total_commission) FILTER (WHERE display_order_status = 2), 0) AS totalCommission,
         COALESCE(SUM(user_commission) FILTER (WHERE display_order_status = 2), 0) AS totalUserCommission,
         COALESCE(SUM(operator_commission) FILTER (WHERE display_order_status = 2), 0) AS totalOperatorCommission
       FROM orders`
    )
    .get();
  return row;
}

module.exports = { upsertOrder, listOrders, countOrders, statsSummary };
