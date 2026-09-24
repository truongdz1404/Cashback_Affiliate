#!/usr/bin/env node
// Re-attributes orders that were stored before lib/subId.js existed.
//
// Shopee's report returns the five sub ids joined with '-' in utm_content
// ("e77053aa49----"), while links.sub_id holds the bare value. Reconciliation
// used to compare the two verbatim, so the lookup never matched and every
// order landed with user_id = NULL - nobody saw their own orders in the app.
//
// Re-running reconciliation fixes any order still inside Shopee's report
// window (upsertOrder updates user_id on existing rows), but orders that have
// aged out of that window never get looked at again. This script repairs them
// in place, reading the sub id back out of orders.raw_json - no Shopee call.
//
//   node scripts/backfill-order-sub-ids.js                      # dry run
//   node scripts/backfill-order-sub-ids.js --apply
//   node scripts/backfill-order-sub-ids.js --apply --detach-unmatched
//   node scripts/backfill-order-sub-ids.js --verbose             # list every row
//
// --detach-unmatched additionally clears user_id on orders whose sub id
// matches no link (organic orders with the bare '----' sub id, or rows a human
// attached by hand). Off by default: it removes an attribution, so it has to
// be asked for.
//
// Runs against DATABASE_URL from .env like server.js does.
require('dotenv').config();
const prisma = require('../lib/prisma');
const linksRepo = require('../lib/repositories/links');
const usersRepo = require('../lib/repositories/users');
const campaignsRepo = require('../lib/repositories/campaigns');
const referralsRepo = require('../lib/repositories/referrals');
const referralCommissionsRepo = require('../lib/repositories/referralCommissions');
const { getEffectivePct, splitAmount } = require('../lib/commissionSplit');
const { parseSubId } = require('../lib/subId');

const BATCH_SIZE = 200;
const PREVIEW_ROWS = 50;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const detachUnmatched = args.includes('--detach-unmatched');
const verbose = args.includes('--verbose');

// The sub id as Shopee actually reported it, which survives untouched in
// raw_json even when the orders row stored a mangled copy of it. Falls back to
// the stored column for rows saved before raw_json was kept.
function sourceSubId(order) {
  if (order.rawJson) {
    try {
      const parsed = JSON.parse(order.rawJson);
      const checkout = parsed && parsed.checkout;
      if (checkout) {
        const raw = checkout.utm_content ?? checkout.utmContent ?? checkout.sub_id1 ?? checkout.subId1;
        if (raw !== undefined && raw !== null) return String(raw);
      }
    } catch {
      // Unparseable payload - the stored column is all we have.
    }
  }
  return order.subId;
}

const pctCache = new Map();
async function effectivePctFor(userId) {
  if (pctCache.has(userId)) return pctCache.get(userId);
  const user = userId === null ? null : await usersRepo.getById(userId);
  const pct = await getEffectivePct(user);
  pctCache.set(userId, pct);
  return pct;
}

async function planFor(order) {
  const canonical = parseSubId(sourceSubId(order));
  const link = canonical ? await linksRepo.findBySubId(canonical) : null;

  // An order carrying a user_id that no link backs is either a leftover from
  // a hand-made fixup or an order whose link has since been deleted - the one
  // thing it is not is something this script can confirm, so it is counted
  // separately and only cleared when --detach-unmatched says so.
  const unbacked = !link && order.userId !== null;

  let nextUserId = order.userId;
  let action;
  if (link) {
    if (link.userId === order.userId) action = 'ok';
    else {
      action = order.userId === null ? 'attributed' : 'reassigned';
      nextUserId = link.userId;
    }
  } else if (unbacked && detachUnmatched) {
    action = 'detached';
    nextUserId = null;
  } else {
    action = canonical ? 'no-link' : 'no-sub-id';
  }

  const data = {};
  if (canonical !== order.subId) data.subId = canonical;
  if (nextUserId !== order.userId) data.userId = nextUserId;

  // The split was computed against whatever pct applied to the *previous*
  // owner (the system default, for an unattributed order) - redo it at the
  // new owner's effective pct so the user is paid what their account says.
  // Never for an order already paid out: that money has left the bank
  // account, and rewriting the figure behind it would hide the discrepancy
  // instead of surfacing it.
  const repayable = order.payoutStatus !== 'paid';
  if (!repayable && 'userId' in data) {
    console.warn(
      `! #${order.id} ${order.orderSn} is already paid out - moving it to user ${data.userId ?? 'null'} ` +
        `but leaving user_commission ${order.userCommission} alone. Check this one by hand.`
    );
  }
  if (repayable && 'userId' in data && order.totalCommission !== null && order.totalCommission !== undefined) {
    const pct = await effectivePctFor(nextUserId);
    const { userAmount, operatorAmount } = splitAmount(order.totalCommission, pct);
    if (userAmount !== order.userCommission) data.userCommission = userAmount;
    if (operatorAmount !== order.operatorCommission) data.operatorCommission = operatorAmount;
  }

  return { canonical, link, action, unbacked, data, changed: Object.keys(data).length > 0 };
}

async function main() {
  if (!apply) console.log('DRY RUN - nothing is written. Re-run with --apply to commit.\n');
  if (detachUnmatched) console.log('--detach-unmatched: orders matching no link will have user_id cleared.\n');

  const counts = {
    scanned: 0,
    subIdFixed: 0,
    attributed: 0,
    reassigned: 0,
    detached: 0,
    noLink: 0,
    noSubId: 0,
    unbacked: 0,
    ok: 0,
  };
  const rewarded = [];
  let printed = 0;
  let cursor;

  for (;;) {
    const batch = await prisma.order.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const order of batch) {
      counts.scanned += 1;
      const { canonical, action, unbacked, data, changed } = await planFor(order);

      if (action === 'attributed') counts.attributed += 1;
      else if (action === 'reassigned') counts.reassigned += 1;
      else if (action === 'detached') counts.detached += 1;
      else if (action === 'no-link') counts.noLink += 1;
      else if (action === 'no-sub-id') counts.noSubId += 1;
      else counts.ok += 1;
      if (unbacked && action !== 'detached') counts.unbacked += 1;
      if ('subId' in data) counts.subIdFixed += 1;

      if (!changed) continue;

      if (verbose || printed < PREVIEW_ROWS) {
        printed += 1;
        const bits = [`#${order.id}`, order.orderSn, action];
        if ('subId' in data) bits.push(`sub ${JSON.stringify(order.subId)} -> ${JSON.stringify(canonical)}`);
        if ('userId' in data) bits.push(`user ${order.userId ?? 'null'} -> ${data.userId ?? 'null'}`);
        if ('userCommission' in data) {
          bits.push(`user_commission ${order.userCommission ?? 'null'} -> ${data.userCommission}`);
        }
        if ('operatorCommission' in data) {
          bits.push(`operator_commission ${order.operatorCommission ?? 'null'} -> ${data.operatorCommission}`);
        }
        console.log(bits.join('  '));
      } else if (printed === PREVIEW_ROWS) {
        printed += 1;
        console.log(`... (further rows hidden, re-run with --verbose to list them all)`);
      }

      if (!apply) continue;

      const saved = await prisma.order.update({ where: { id: order.id }, data });

      // An order that only now has an owner never went through the
      // post-upsert hooks in lib/reconciliation.js, so the referrer's cut and
      // any campaign tier it should have unlocked are still missing. All
      // three calls are idempotent (unique constraint / pending-only guard /
      // upsert by order id), so this is safe on a re-run.
      if ('userId' in data && saved.userId && saved.displayOrderStatus === 2) {
        await campaignsRepo.grantRewardsForUser(saved.userId);
        await referralsRepo.qualifyIfEligible(saved.userId, saved.id);
        await referralCommissionsRepo.syncForCompletedOrder(saved);
        rewarded.push(saved.orderSn);
      }
    }
  }

  console.log('');
  console.log(`scanned            ${counts.scanned}`);
  console.log(`sub_id normalised  ${counts.subIdFixed}`);
  console.log(`newly attributed   ${counts.attributed}`);
  console.log(`re-assigned        ${counts.reassigned}`);
  console.log(`detached           ${counts.detached}`);
  console.log(`no matching link   ${counts.noLink}`);
  console.log(`no sub id at all   ${counts.noSubId}`);
  console.log(`already correct    ${counts.ok}`);
  if (counts.unbacked) {
    console.log(
      `\n${counts.unbacked} order(s) carry a user_id that no link backs.` +
        (detachUnmatched ? '' : ' Re-run with --detach-unmatched to clear them.')
    );
  }
  if (rewarded.length) {
    console.log(`\nre-ran referral/campaign hooks for ${rewarded.length} completed order(s): ${rewarded.join(', ')}`);
  }
  if (!apply && counts.attributed + counts.reassigned + counts.detached + counts.subIdFixed > 0) {
    console.log('\nNothing was written. Re-run with --apply.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
