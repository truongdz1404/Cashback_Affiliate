const prisma = require('./prisma');
const browserManager = require('./browserManager');
const linksRepo = require('./repositories/links');
const ordersRepo = require('./repositories/orders');
const usersRepo = require('./repositories/users');
const campaignsRepo = require('./repositories/campaigns');
const referralsRepo = require('./repositories/referrals');
const clawbackRepo = require('./repositories/clawback');
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
 * Confirmed against a live order (see /debug/report-list): each report/list
 * entry is one *checkout*, not one order - order_sn/order_id/display_order_status
 * live one level down in entry.orders[] (a checkout can contain more than one
 * order), and commission is per line item (order.items[].item_commission),
 * not on the checkout or order itself. purchase_time/utm_content are shared
 * across every order in the same checkout, so they're read off the checkout.
 */
function mapEntry(entry, order) {
  const orderSn = pick(order, 'order_sn', 'orderSn', 'order_id', 'orderId');
  const subId = pick(entry, 'utm_content', 'utmContent', 'sub_id1', 'subId1');
  const items = Array.isArray(order.items) ? order.items : [];
  const totalCommission = items.length
    ? items.reduce((sum, item) => sum + (Number(pick(item, 'item_commission', 'itemCommission')) || 0), 0)
    : Number(pick(order, 'total_commission', 'totalCommission', 'commission', 'estimated_commission')) || 0;
  // First line item's product name, if Shopee's payload carries one - used as
  // an honest display title instead of a fabricated "Sản phẩm Shopee ...".
  const productName = items.length
    ? pick(items[0], 'item_name', 'itemName', 'product_name', 'productName', 'name')
    : null;
  const displayOrderStatusRaw = pick(order, 'display_order_status', 'displayOrderStatus', 'order_status', 'status');
  const displayOrderStatus = displayOrderStatusRaw === null ? null : Number(displayOrderStatusRaw);
  // Shopee returns purchase_time as a Unix timestamp number, but the orders.purchase_time
  // column is TEXT (schema.prisma: `purchaseTime String?`) - coerce or Prisma rejects it.
  const purchaseTimeRaw = pick(entry, 'purchase_time', 'purchaseTime', 'order_time', 'create_time');
  const purchaseTime = purchaseTimeRaw === null ? null : String(purchaseTimeRaw);
  return { orderSn, subId, totalCommission, productName, displayOrderStatus, purchaseTime };
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
      const orders = Array.isArray(entry.orders) ? entry.orders : [];
      for (const order of orders) {
        processed += 1;
        const mapped = mapEntry(entry, order);
        if (!mapped.orderSn) continue;

        const link = mapped.subId ? await linksRepo.findBySubId(mapped.subId) : null;
        const user = link ? await usersRepo.getById(link.userId) : null;
        const effectivePct = await getEffectivePct(user);
        const { userAmount, operatorAmount } = splitAmount(mapped.totalCommission, effectivePct);

        const orderData = {
          orderSn: mapped.orderSn,
          userId: link ? link.userId : null,
          subId: mapped.subId,
          totalCommission: mapped.totalCommission,
          userCommission: userAmount,
          operatorCommission: operatorAmount,
          displayOrderStatus: mapped.displayOrderStatus,
          purchaseTime: mapped.purchaseTime,
          productName: mapped.productName,
          rawJson: JSON.stringify({ checkout: entry, order }),
        };

        // Wrapped in one transaction so a newly-detected Cancelled order's
        // payout reversal/clawback-flag and its referral/campaign-reward
        // revocation either all land together or none do.
        const savedOrder = await prisma.$transaction(async (tx) => {
          const saved = await ordersRepo.upsertOrder(orderData, tx);
          if (saved.wasNewlyCancelled && saved.userId) {
            const revoked = await referralsRepo.revokeReferralForOrder(saved.id, tx);
            if (revoked?.needsClawback) {
              await clawbackRepo.flag(
                {
                  userId: revoked.referral.referrerUserId,
                  sourceType: 'referral',
                  sourceId: revoked.referral.id,
                  previousPayoutStatus: revoked.referral.payoutStatus,
                  amount: revoked.referral.rewardAmount ?? 0,
                },
                tx,
              );
            }
            const flaggedRewards = await campaignsRepo.reevaluateRewardsForUser(saved.userId, tx);
            for (const reward of flaggedRewards) {
              await clawbackRepo.flag(
                {
                  userId: reward.userId,
                  sourceType: 'campaignReward',
                  sourceId: reward.id,
                  previousPayoutStatus: reward.payoutStatus,
                  amount: reward.rewardAmount ?? 0,
                },
                tx,
              );
            }
          }
          return saved;
        });
        upserted += 1;

        // Campaign tiers and referral qualification only care about orders
        // that actually completed (display_order_status 2) - both calls are
        // idempotent (UNIQUE constraint / pending-only guard) so re-processing
        // the same order on a later reconcile run is safe.
        if (savedOrder.displayOrderStatus === 2 && savedOrder.userId) {
          await campaignsRepo.grantRewardsForUser(savedOrder.userId);
          await referralsRepo.qualifyIfEligible(savedOrder.userId, savedOrder.id);
        }
      }
    }

    if (list.length < PAGE_SIZE) break;
    pageNum += 1;
  }

  return { processed, upserted, totalCount, pages: pageNum };
}

module.exports = { reconcileOrders };
