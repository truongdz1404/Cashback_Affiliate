const prisma = require('../prisma');
const { Prisma } = require('@prisma/client');
const { ORDER_AT, localAt, dayRange } = require('../sqlTime');

// Every chart on the admin reports screen is grouped by Vietnamese calendar
// day; lib/sqlTime.js holds the fragments that work out which day a row
// belongs to, shared with the admin order list's date filters.

// COUNT(*) comes back as BigInt from node-postgres, which JSON.stringify
// throws on, and SUM(double precision) can come back as a string. Everything
// numeric is coerced once, here, so no caller has to think about it.
function num(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function numify(row, skip = []) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = skip.includes(key) ? value : num(value);
  }
  return out;
}

// display_order_status: 1=Pending, 2=Completed, 3=Cancelled, 4=Unpaid.
// Money is only ever summed over Completed orders - a pending order's
// commission is a forecast Shopee can still withdraw, and counting it in a
// revenue chart would show income that may never arrive.
const ORDER_MEASURES = Prisma.sql`
  COUNT(*) AS "orders",
  COUNT(*) FILTER (WHERE o.display_order_status = 2) AS "completedOrders",
  COUNT(*) FILTER (WHERE o.display_order_status = 1) AS "pendingOrders",
  COUNT(*) FILTER (WHERE o.display_order_status = 3) AS "cancelledOrders",
  COUNT(DISTINCT o.user_id) FILTER (WHERE o.user_id IS NOT NULL) AS "buyers",
  COALESCE(SUM(o.total_commission) FILTER (WHERE o.display_order_status = 2), 0) AS "totalCommission",
  COALESCE(SUM(o.user_commission) FILTER (WHERE o.display_order_status = 2), 0) AS "userCommission",
  COALESCE(SUM(o.operator_commission) FILTER (WHERE o.display_order_status = 2), 0) AS "operatorCommission",
  COALESCE(SUM(o.user_commission) FILTER (WHERE o.display_order_status = 2 AND o.payout_status = 'paid'), 0) AS "paidAmount",
  COALESCE(SUM(o.user_commission) FILTER (WHERE o.display_order_status = 2 AND o.payout_status = 'unpaid'), 0) AS "unpaidAmount"
`;

async function orderTotals(from, to) {
  const rows = await prisma.$queryRaw`
    SELECT ${ORDER_MEASURES} FROM orders o WHERE ${dayRange(ORDER_AT, from, to)}
  `;
  return numify(rows[0] ?? {});
}

async function sideTotals(from, to) {
  const [users] = await prisma.$queryRaw`
    SELECT COUNT(*) AS "newUsers" FROM users u
    WHERE ${dayRange(localAt('u.created_at'), from, to)}
  `;
  const [withdrawals] = await prisma.$queryRaw`
    SELECT
      COUNT(*) AS "withdrawals",
      COALESCE(SUM(w.amount), 0) AS "withdrawalAmount",
      COUNT(*) FILTER (WHERE w.status = 'paid') AS "withdrawalsPaid",
      COALESCE(SUM(w.amount) FILTER (WHERE w.status = 'paid'), 0) AS "withdrawalPaidAmount"
    FROM withdrawal_requests w
    WHERE ${dayRange(localAt('w.created_at'), from, to)}
  `;
  const [referrals] = await prisma.$queryRaw`
    SELECT
      COUNT(*) AS "referralCommissions",
      COALESCE(SUM(r.amount), 0) AS "referralAmount"
    FROM referral_commissions r
    WHERE ${dayRange(localAt('r.created_at'), from, to)}
  `;
  return { ...numify(users), ...numify(withdrawals), ...numify(referrals) };
}

async function totals(from, to) {
  const [orders, side] = await Promise.all([orderTotals(from, to), sideTotals(from, to)]);
  const merged = { ...orders, ...side };
  // Derived rather than summed: averaging a daily average would weight a
  // quiet day the same as a busy one.
  merged.avgCommissionPerOrder = merged.completedOrders
    ? merged.userCommission / merged.completedOrders
    : 0;
  return merged;
}

// One row per calendar day in the window, including the days nothing happened
// - a line chart with the empty days missing draws a flat segment across the
// gap instead of the dip that actually occurred.
async function series(from, to) {
  const rows = await prisma.$queryRaw`
    WITH days AS (
      SELECT generate_series(${from}::date, ${to}::date, interval '1 day')::date AS day
    ),
    o AS (
      SELECT ${ORDER_AT}::date AS day, ${ORDER_MEASURES}
      FROM orders o
      WHERE ${dayRange(ORDER_AT, from, to)}
      GROUP BY 1
    ),
    u AS (
      SELECT ${localAt('u.created_at')}::date AS day, COUNT(*) AS "newUsers"
      FROM users u
      WHERE ${dayRange(localAt('u.created_at'), from, to)}
      GROUP BY 1
    ),
    w AS (
      SELECT ${localAt('w.created_at')}::date AS day,
             COUNT(*) AS "withdrawals",
             COALESCE(SUM(w.amount), 0) AS "withdrawalAmount"
      FROM withdrawal_requests w
      WHERE ${dayRange(localAt('w.created_at'), from, to)}
      GROUP BY 1
    )
    SELECT
      to_char(days.day, 'YYYY-MM-DD') AS "date",
      COALESCE(o."orders", 0) AS "orders",
      COALESCE(o."completedOrders", 0) AS "completedOrders",
      COALESCE(o."pendingOrders", 0) AS "pendingOrders",
      COALESCE(o."cancelledOrders", 0) AS "cancelledOrders",
      COALESCE(o."buyers", 0) AS "buyers",
      COALESCE(o."totalCommission", 0) AS "totalCommission",
      COALESCE(o."userCommission", 0) AS "userCommission",
      COALESCE(o."operatorCommission", 0) AS "operatorCommission",
      COALESCE(o."paidAmount", 0) AS "paidAmount",
      COALESCE(o."unpaidAmount", 0) AS "unpaidAmount",
      COALESCE(u."newUsers", 0) AS "newUsers",
      COALESCE(w."withdrawals", 0) AS "withdrawals",
      COALESCE(w."withdrawalAmount", 0) AS "withdrawalAmount"
    FROM days
    LEFT JOIN o ON o.day = days.day
    LEFT JOIN u ON u.day = days.day
    LEFT JOIN w ON w.day = days.day
    ORDER BY days.day
  `;
  return rows.map((row) => numify(row, ['date']));
}

async function topProducts(from, to, limit) {
  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE(NULLIF(o.product_name, ''), 'Không rõ tên') AS "name",
      COUNT(*) AS "orders",
      COALESCE(SUM(o.user_commission) FILTER (WHERE o.display_order_status = 2), 0) AS "userCommission",
      COALESCE(SUM(o.total_commission) FILTER (WHERE o.display_order_status = 2), 0) AS "totalCommission"
    FROM orders o
    WHERE ${dayRange(ORDER_AT, from, to)}
    GROUP BY 1
    ORDER BY "userCommission" DESC, "orders" DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => numify(row, ['name']));
}

async function topCustomers(from, to, limit) {
  const rows = await prisma.$queryRaw`
    SELECT
      u.id AS "userId",
      u.full_name AS "fullName",
      u.phone AS "phone",
      u.email AS "email",
      COUNT(*) AS "orders",
      COUNT(*) FILTER (WHERE o.display_order_status = 2) AS "completedOrders",
      COALESCE(SUM(o.user_commission) FILTER (WHERE o.display_order_status = 2), 0) AS "userCommission"
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE ${dayRange(ORDER_AT, from, to)}
    GROUP BY u.id
    ORDER BY "userCommission" DESC, "orders" DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => numify(row, ['fullName', 'phone', 'email']));
}

// Status mix for the donut: how the window's orders split across Shopee's
// four states, plus how much commission is sitting in each.
async function statusMix(from, to) {
  const rows = await prisma.$queryRaw`
    SELECT
      o.display_order_status AS "status",
      COUNT(*) AS "orders",
      COALESCE(SUM(o.user_commission), 0) AS "userCommission"
    FROM orders o
    WHERE ${dayRange(ORDER_AT, from, to)}
    GROUP BY 1
    ORDER BY "orders" DESC
  `;
  return rows.map((row) => ({
    ...numify(row),
    status: row.status === null || row.status === undefined ? null : Number(row.status),
  }));
}

// The window immediately before the requested one, of the same length, so
// every headline number can show "so với kỳ trước" without the caller having
// to work out the dates.
function previousWindow(from, to) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days = Math.round((end - start) / 86400000) + 1;
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(prevStart), to: iso(prevEnd), days };
}

async function overview({ from, to, topLimit = 8 } = {}) {
  const prev = previousWindow(from, to);
  const [current, previous, daily, products, customers, mix] = await Promise.all([
    totals(from, to),
    totals(prev.from, prev.to),
    series(from, to),
    topProducts(from, to, topLimit),
    topCustomers(from, to, topLimit),
    statusMix(from, to),
  ]);
  return {
    range: { from, to, days: prev.days, previousFrom: prev.from, previousTo: prev.to },
    totals: current,
    previous,
    series: daily,
    topProducts: products,
    topCustomers: customers,
    statusMix: mix,
  };
}

module.exports = { overview, totals, series, topProducts, topCustomers, statusMix, previousWindow };
