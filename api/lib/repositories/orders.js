const prisma = require('../prisma');
const clawbackRepo = require('./clawback');
const campaignsRepo = require('./campaigns');
const { decodeOrderItems } = require('../orderItems');
const { parseSubId } = require('../subId');

// Money columns are double precision, so "did the commission change" can never
// be an equality test. Half a dong is well under anything transferable and well
// over the representation error.
const COMMISSION_EPSILON = 0.5;

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

  // Shopee does occasionally report a cancelled order as Completed again. The
  // 'cancelled' payout status was never cleared, so the order stayed out of
  // the balance for good and the user simply never got paid for it.
  if (existing && existing.payoutStatus === 'cancelled' && order.displayOrderStatus === 2) {
    data.payoutStatus = 'unpaid';
  }

  // Shopee can also revise the commission on an order it already reported,
  // without cancelling it. Revised down on an order we have already paid out,
  // that difference is money gone, so it gets the same manual-review flag a
  // cancellation does - for the difference alone, not the whole order. Nothing
  // is flagged for a revision upwards: the operator's share absorbs it and
  // nobody is out of pocket. On an order not yet paid, neither direction needs
  // a flag - the new figure is simply what the balance now shows.
  const previousCommission = existing?.userCommission ?? 0;
  const nextCommission = order.userCommission ?? 0;
  const shortfall = previousCommission - nextCommission;
  const wasPaidAndRevisedDown =
    Boolean(existing) && existing.payoutStatus === 'paid' && !wasNewlyCancelled && shortfall > COMMISSION_EPSILON;

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
  } else if (wasPaidAndRevisedDown) {
    // Flagged once, not on every run: the row now holds the revised figure, so
    // the next reconcile compares equal and finds nothing to report.
    await clawbackRepo.flag(
      {
        userId: existing.userId,
        sourceType: 'order',
        sourceId: existing.id,
        previousPayoutStatus: existing.payoutStatus,
        amount: shortfall,
      },
      tx,
    );
  }

  return { ...saved, wasNewlyCancelled, wasPaidAndRevisedDown };
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

// The app's order card shows the same detail Shopee's own order list does
// (shop, thumbnail, product title, variation, quantity, price, order total),
// all of which lives in raw_json - decoded here so the app never has to parse
// Shopee's payload itself. raw_json itself is dropped from the response: it's
// several KB per order of fields nothing on the client reads.
async function listByUser(userId, { limit = 50, offset = 0 } = {}) {
  const rows = await prisma.order.findMany({
    where: { userId: Number(userId) },
    orderBy: { id: 'desc' },
    take: limit,
    skip: offset,
  });
  return withItems(rows, Number(userId));
}

async function withItems(rows, userId) {
  const decoded = rows.map((row) => ({ row, items: decodeOrderItems(row.rawJson) }));
  const affiliateUrls = await resolveAffiliateUrls(decoded, userId);

  return decoded.map(({ row, items }) => {
    const { rawJson, ...order } = row;
    const withUrls = items.map((item) => ({
      ...item,
      affiliateUrl: affiliateUrls.get(affiliateKey(row.subId, item.itemId)) ?? null,
    }));
    return {
      ...order,
      items: withUrls,
      // Every line of a Shopee order belongs to the same shop, so the card's
      // header can use the first item's.
      shopName: withUrls.find((item) => item.shopName)?.shopName ?? null,
      itemCount: withUrls.reduce((sum, item) => sum + item.qty, 0),
      orderAmount: withUrls.length
        ? withUrls.reduce((sum, item) => sum + (item.amount ?? 0), 0)
        : null,
    };
  });
}

// What an order row looks like once it leaves for the app or the website.
// The full row carries totalCommission and operatorCommission - what Shopee
// paid us and what we kept - which is our margin, not the customer's business,
// and it carries subId, an internal tracking token that was being printed on
// the order detail screen under a label no shopper could act on. The admin
// dashboard reads the same repository and still gets every column; only the
// two /app routes go through here.
function toPublicAppOrder(order) {
  const { totalCommission: _total, operatorCommission: _operator, subId: _subId, userId: _userId, ...rest } = order;
  return rest;
}

function affiliateKey(subId, itemId) {
  return `${subId ?? ''}::${itemId ?? ''}`;
}

// Tapping a product in the order list should re-open it through this user's
// own affiliate link, so a repeat purchase is attributed (and earns cashback)
// exactly like the first one. Best source is the very link that produced the
// order (orders.sub_id -> links.sub_id); for the other lines of a multi-item
// order that link points at a different product, so fall back to the newest
// link this user has for that item. Both lookups are batched over the whole
// page - never one query per row.
async function resolveAffiliateUrls(decoded, userId) {
  // Rows reconciled before the utm_content parsing fix still hold the joined
  // form ('e77053aa49----'), so normalise on read too - otherwise those orders
  // never match their own link (see lib/subId.js).
  const subIds = [...new Set(decoded.map(({ row }) => parseSubId(row.subId)).filter(Boolean))];
  const itemIds = [...new Set(decoded.flatMap(({ items }) => items.map((i) => i.itemId)).filter(Boolean))];
  if (!subIds.length && !itemIds.length) return new Map();

  const [bySubId, byItem] = await Promise.all([
    subIds.length
      ? prisma.link.findMany({
          where: { subId: { in: subIds } },
          select: { subId: true, itemId: true, affiliateUrl: true },
        })
      : [],
    itemIds.length && Number.isFinite(userId)
      ? prisma.link.findMany({
          where: { userId, itemId: { in: itemIds }, affiliateUrl: { not: null } },
          orderBy: { createdAt: 'desc' },
          select: { itemId: true, affiliateUrl: true },
        })
      : [],
  ]);

  const newestByItem = new Map();
  for (const link of byItem) {
    if (!newestByItem.has(link.itemId)) newestByItem.set(link.itemId, link.affiliateUrl);
  }
  const orderLinks = new Map(bySubId.map((link) => [link.subId, link]));

  const resolved = new Map();
  for (const { row, items } of decoded) {
    for (const item of items) {
      const rowSubId = parseSubId(row.subId);
      const orderLink = rowSubId ? orderLinks.get(rowSubId) : null;
      const url =
        orderLink && orderLink.itemId === item.itemId && orderLink.affiliateUrl
          ? orderLink.affiliateUrl
          : newestByItem.get(item.itemId) ?? null;
      if (url) resolved.set(affiliateKey(row.subId, item.itemId), url);
    }
  }
  return resolved;
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
      u.email AS "email",
      u.full_name AS "fullName",
      u.role AS "role",
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

// Campaign tier progress is measured in commission already paid out, so this
// is the moment a new tier can be reached - not reconciliation time, where the
// order being completed is still unpaid and so cannot count towards its own
// tier. Without this a user could cross a milestone and never be granted the
// reward, because nothing re-checked after the only event that moves the number.
async function setPayoutStatus(orderId, paid) {
  const updated = await prisma.order.update({
    where: { id: Number(orderId) },
    data: { payoutStatus: paid ? 'paid' : 'unpaid', paidAt: paid ? new Date().toISOString() : null },
  });
  if (updated.userId) {
    if (paid) await campaignsRepo.grantRewardsForUser(updated.userId);
    else await campaignsRepo.reevaluateRewardsForUser(updated.userId);
  }
  return updated;
}

// Wallet tab summary for one app user: paid/unpaid totals for completed
// orders, still-pending count, and this-calendar-month paid total (for the
// "earned this month" headline number).
async function summaryForUser(userId, tx = prisma) {
  const rows = await tx.$queryRaw`
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
  toPublicAppOrder,
};
