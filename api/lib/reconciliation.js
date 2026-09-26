const prisma = require('./prisma');
const browserManager = require('./browserManager');
const linksRepo = require('./repositories/links');
const ordersRepo = require('./repositories/orders');
const usersRepo = require('./repositories/users');
const campaignsRepo = require('./repositories/campaigns');
const referralsRepo = require('./repositories/referrals');
const referralCommissionsRepo = require('./repositories/referralCommissions');
const clawbackRepo = require('./repositories/clawback');
const { getEffectivePct, splitAmount } = require('./commissionSplit');
// Shared with the decoder that reads the same payload back out of
// orders.raw_json for the app's order card - both must use the same scale.
const { SHOPEE_AMOUNT_SCALE } = require('./orderItems');
const { parseSubId } = require('./subId');
const { withJobRun } = require('./jobRunner');

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
  // utm_content is the five sub ids joined with '-'; only the first one is
  // ours, and it is what links.sub_id holds (see lib/subId.js).
  const subId = parseSubId(pick(entry, 'utm_content', 'utmContent', 'sub_id1', 'subId1'));
  const items = Array.isArray(order.items) ? order.items : [];
  // Per item, Shopee splits commission into a platform share (item_commission)
  // and, for brand/Xtra deals, an extra brand share (capped_brand_commission) -
  // both must be summed to match the dashboard's "Hoa hồng sản phẩm" total.
  const rawTotalCommission = items.length
    ? items.reduce((sum, item) => {
        const platform = Number(pick(item, 'item_commission', 'itemCommission')) || 0;
        const brand = Number(pick(item, 'capped_brand_commission', 'cappedBrandCommission')) || 0;
        return sum + platform + brand;
      }, 0)
    : Number(pick(order, 'total_commission', 'totalCommission', 'commission', 'estimated_commission')) || 0;
  const totalCommission = rawTotalCommission / SHOPEE_AMOUNT_SCALE;
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
            const revokedCommission = await referralCommissionsRepo.revokeForOrder(saved.id, tx);
            if (revokedCommission?.needsClawback) {
              await clawbackRepo.flag(
                {
                  userId: revokedCommission.commission.referrerUserId,
                  sourceType: 'referralCommission',
                  sourceId: revokedCommission.commission.id,
                  previousPayoutStatus: revokedCommission.commission.payoutStatus,
                  amount: revokedCommission.commission.amount ?? 0,
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

        // Campaign tiers, referral qualification and the referrer's per-order
        // commission only care about orders that actually completed
        // (display_order_status 2) - all three calls are idempotent (UNIQUE
        // constraint / pending-only guard / upsert by order_id) so
        // re-processing the same order on a later reconcile run is safe.
        if (savedOrder.displayOrderStatus === 2 && savedOrder.userId) {
          await campaignsRepo.grantRewardsForUser(savedOrder.userId);
          await referralsRepo.qualifyIfEligible(savedOrder.userId, savedOrder.id);
          await referralCommissionsRepo.syncForCompletedOrder(savedOrder);
        }
      }
    }

    if (list.length < PAGE_SIZE) break;
    pageNum += 1;
  }

  return { processed, upserted, totalCount, pages: pageNum };
}

/**
 * The scheduled/admin entry point: reconcileOrders plus an audit row and a
 * one-at-a-time guard.
 *
 * The audit row exists because "did the reconcile actually run?" used to be
 * answerable only by SSH-ing to the box and reading container logs - and a
 * deploy recreates the containers, so those logs are gone on every push. An
 * order that never showed up as commission is exactly the moment someone needs
 * that answer, and that is the moment the evidence was missing.
 *
 * The guard exists because this now runs hourly rather than every six hours, so
 * a run that overruns its slot stopped being hypothetical. Two of them paging
 * the same report would race on the same order rows and spend twice the Shopee
 * calls to reach the same state. A skipped run deliberately leaves NO row: it
 * did no work, and the point of the table is to show work.
 */
let running = null;

async function runReconcile({ trigger = 'cron' } = {}) {
  if (running) return { skipped: true, reason: `một lượt đối soát khác đang chạy (${running})` };
  running = trigger;
  try {
    return await withJobRun('order-reconcile', trigger, () => reconcileOrders());
  } finally {
    running = null;
  }
}

module.exports = { reconcileOrders, runReconcile };
