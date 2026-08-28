const browserManager = require('./browserManager');
const linksRepo = require('./repositories/links');
const ordersRepo = require('./repositories/orders');
const usersRepo = require('./repositories/users');
const campaignsRepo = require('./repositories/campaigns');
const referralsRepo = require('./repositories/referrals');
const { getEffectivePct, splitAmount } = require('./commissionSplit');

const REPORT_LIST_URL = 'https://affiliate.shopee.vn/api/v3/report/list';
const PAGE_SIZE = 50;
// Safety cap so a shape/pagination mismatch can't spin this into an
// unbounded loop against Shopee's API.
const MAX_PAGES = 200;

async function fetchReportPage(cookieHeader, pageNum, extraParams) {
  const qs = new URLSearchParams({ page_num: pageNum, page_size: PAGE_SIZE, ...extraParams }).toString();
  const response = await fetch(`${REPORT_LIST_URL}?${qs}`, {
    headers: { cookie: cookieHeader, accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`report/list status ${response.status}`);
  const json = await response.json().catch(() => null);
  if (!json || !json.data) throw new Error('report/list did not return usable data');
  return json.data;
}

function pick(entry, ...keys) {
  for (const k of keys) {
    if (entry[k] !== undefined && entry[k] !== null) return entry[k];
  }
  return null;
}

/**
 * The real shape of a report/list entry hasn't been confirmed yet against a
 * live order (no orders have gone through the system so far) - this reads
 * both the snake_case and camelCase spelling of each field defensively, and
 * the full raw entry is kept in orders.raw_json so the mapping below can be
 * corrected against the first real order without re-deriving it from
 * scratch.
 */
function mapEntry(entry) {
  const orderSn = pick(entry, 'order_sn', 'orderSn', 'order_id', 'orderId');
  const subId = pick(entry, 'utm_content', 'utmContent', 'sub_id1', 'subId1');
  const totalCommission =
    Number(pick(entry, 'total_commission', 'totalCommission', 'commission', 'estimated_commission')) || 0;
  const displayOrderStatusRaw = pick(entry, 'display_order_status', 'displayOrderStatus', 'order_status', 'status');
  const displayOrderStatus = displayOrderStatusRaw === null ? null : Number(displayOrderStatusRaw);
  const purchaseTime = pick(entry, 'purchase_time', 'purchaseTime', 'order_time', 'create_time');
  return { orderSn, subId, totalCommission, displayOrderStatus, purchaseTime };
}

/**
 * Pulls every order from Shopee's affiliate report/list, matches each one
 * back to a user via utm_content -> links.sub_id -> user_id, and upserts
 * into the orders table with the commission split applied at that user's
 * effective percentage (their own override if set, else the system
 * default - see lib/commissionSplit.js).
 */
async function reconcileOrders({ extraParams = {} } = {}) {
  const context = await browserManager.getContext();
  const cookies = await context.cookies();
  const cookieHeader = cookies
    .filter((c) => /shopee/i.test(c.domain))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  let pageNum = 1;
  let processed = 0;
  let upserted = 0;
  let totalCount = null;

  while (pageNum <= MAX_PAGES) {
    const page = await fetchReportPage(cookieHeader, pageNum, extraParams);
    totalCount = page.total_count ?? totalCount;
    const list = Array.isArray(page.list) ? page.list : [];
    if (list.length === 0) break;

    for (const entry of list) {
      processed += 1;
      const mapped = mapEntry(entry);
      if (!mapped.orderSn) continue;

      const link = mapped.subId ? await linksRepo.findBySubId(mapped.subId) : null;
      const user = link ? await usersRepo.getById(link.userId) : null;
      const effectivePct = await getEffectivePct(user);
      const { userAmount, operatorAmount } = splitAmount(mapped.totalCommission, effectivePct);

      const savedOrder = await ordersRepo.upsertOrder({
        orderSn: mapped.orderSn,
        userId: link ? link.userId : null,
        subId: mapped.subId,
        totalCommission: mapped.totalCommission,
        userCommission: userAmount,
        operatorCommission: operatorAmount,
        displayOrderStatus: mapped.displayOrderStatus,
        purchaseTime: mapped.purchaseTime,
        rawJson: JSON.stringify(entry),
      });
      upserted += 1;

      // Campaign tiers and referral qualification only care about orders
      // that actually completed (display_order_status 2) - both calls are
      // idempotent (UNIQUE constraint / pending-only guard) so re-processing
      // the same order on a later reconcile run is safe.
      if (savedOrder.displayOrderStatus === 2 && savedOrder.userId) {
        await campaignsRepo.grantRewardsForUser(savedOrder.userId);
        await referralsRepo.qualifyIfEligible(savedOrder.userId);
      }
    }

    if (list.length < PAGE_SIZE) break;
    pageNum += 1;
  }

  return { processed, upserted, totalCount, pages: pageNum };
}

module.exports = { reconcileOrders };
