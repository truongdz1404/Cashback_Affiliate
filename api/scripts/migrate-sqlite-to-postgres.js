// One-time data migration: legacy SQLite storage -> the new PostgreSQL
// database read/written via Prisma. Opens the SQLite file strictly
// read-only (never touches it) and writes into Postgres via createMany,
// preserving original ids, then fixes up each table's serial sequence so
// the next INSERT via Prisma doesn't collide with a migrated id.
//
// Safe to re-run: every createMany uses skipDuplicates, so rows already
// migrated by an earlier run are silently skipped and only new SQLite rows
// get inserted.
//
// Usage: node scripts/migrate-sqlite-to-postgres.js [path-to-app.db]
// Defaults to storage/app.db. DATABASE_URL (Postgres target) comes from
// .env / the environment, same as the running server.
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { PrismaClient } = require('@prisma/client');

const sqlitePath = process.argv[2] || path.join(__dirname, '..', 'storage', 'app.db');
if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`);
  process.exit(1);
}

const prisma = new PrismaClient();
const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });

function tableExists(name) {
  return !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function allRows(table) {
  if (!tableExists(table)) return [];
  return sqlite.prepare(`SELECT * FROM ${table}`).all();
}

// SQLite has no real DATETIME type - created_at/updated_at were stored as
// TEXT ('YYYY-MM-DD HH:MM:SS' or ISO). new Date() parses either; anything
// missing/unparseable falls back to the Prisma column default (now()) by
// being passed through as undefined.
function toDate(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function resetSequence(table) {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), (SELECT MAX(id) FROM ${table}) IS NOT NULL)`
  );
}

async function migrateUsers() {
  const rows = allRows('users');
  if (!rows.length) return console.log('users: nothing to migrate');

  // referred_by_user_id can forward-reference a user row inserted later in
  // the same batch (self-referencing FK) - insert with it nulled out first,
  // then backfill in a second pass once every user row exists.
  await prisma.user.createMany({
    data: rows.map((r) => ({
      id: r.id,
      zaloUserId: r.zalo_user_id,
      phone: r.phone ?? null,
      bankName: r.bank_name ?? null,
      bankAccountNumber: r.bank_account_number ?? null,
      bankAccountHolder: r.bank_account_holder ?? null,
      commissionPct: r.commission_pct ?? null,
      passwordHash: r.password_hash ?? null,
      referralCode: r.referral_code ?? null,
      referredByUserId: null,
      createdAt: toDate(r.created_at),
    })),
    skipDuplicates: true,
  });

  for (const r of rows) {
    if (r.referred_by_user_id) {
      await prisma.user.update({ where: { id: r.id }, data: { referredByUserId: r.referred_by_user_id } });
    }
  }

  await resetSequence('users');
  console.log(`users: migrated ${rows.length}`);
}

async function migrateSettings() {
  const rows = allRows('settings');
  if (!rows.length) return console.log('settings: nothing to migrate');

  await prisma.setting.createMany({
    data: rows.map((r) => ({ key: r.key, value: r.value })),
    skipDuplicates: true,
  });
  console.log(`settings: migrated ${rows.length}`);
}

async function migrateLinks() {
  const rows = allRows('links');
  if (!rows.length) return console.log('links: nothing to migrate');

  await prisma.link.createMany({
    data: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      itemId: r.item_id ?? null,
      subId: r.sub_id,
      shopeeUrl: r.shopee_url ?? null,
      affiliateUrl: r.affiliate_url ?? null,
      createdAt: toDate(r.created_at),
    })),
    skipDuplicates: true,
  });
  await resetSequence('links');
  console.log(`links: migrated ${rows.length}`);
}

async function migrateOrders() {
  const rows = allRows('orders');
  if (!rows.length) return console.log('orders: nothing to migrate');

  await prisma.order.createMany({
    data: rows.map((r) => ({
      id: r.id,
      orderSn: r.order_sn,
      userId: r.user_id ?? null,
      subId: r.sub_id ?? null,
      totalCommission: r.total_commission ?? null,
      userCommission: r.user_commission ?? null,
      operatorCommission: r.operator_commission ?? null,
      displayOrderStatus: r.display_order_status ?? null,
      payoutStatus: r.payout_status ?? 'unpaid',
      paidAt: r.paid_at ?? null,
      purchaseTime: r.purchase_time ?? null,
      rawJson: r.raw_json ?? null,
      createdAt: toDate(r.created_at),
    })),
    skipDuplicates: true,
  });
  await resetSequence('orders');
  console.log(`orders: migrated ${rows.length}`);
}

async function migrateCampaigns() {
  const rows = allRows('campaigns');
  if (!rows.length) return console.log('campaigns: nothing to migrate');

  await prisma.campaign.createMany({
    data: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? null,
      startsAt: r.starts_at ?? null,
      endsAt: r.ends_at ?? null,
      tiersJson: r.tiers_json ?? '[]',
      isActive: !!r.is_active,
      createdAt: toDate(r.created_at),
    })),
    skipDuplicates: true,
  });
  await resetSequence('campaigns');
  console.log(`campaigns: migrated ${rows.length}`);
}

async function migrateCampaignRewards() {
  const rows = allRows('campaign_rewards');
  if (!rows.length) return console.log('campaign_rewards: nothing to migrate');

  await prisma.campaignReward.createMany({
    data: rows.map((r) => ({
      id: r.id,
      campaignId: r.campaign_id,
      userId: r.user_id,
      orderThreshold: r.order_threshold,
      rewardAmount: r.reward_amount,
      payoutStatus: r.payout_status ?? 'unpaid',
      paidAt: r.paid_at ?? null,
      createdAt: toDate(r.created_at),
    })),
    skipDuplicates: true,
  });
  await resetSequence('campaign_rewards');
  console.log(`campaign_rewards: migrated ${rows.length}`);
}

async function migrateReferrals() {
  const rows = allRows('referrals');
  if (!rows.length) return console.log('referrals: nothing to migrate');

  await prisma.referral.createMany({
    data: rows.map((r) => ({
      id: r.id,
      referrerUserId: r.referrer_user_id,
      referredUserId: r.referred_user_id,
      status: r.status ?? 'pending',
      rewardAmount: r.reward_amount ?? null,
      createdAt: toDate(r.created_at),
      qualifiedAt: r.qualified_at ?? null,
    })),
    skipDuplicates: true,
  });
  await resetSequence('referrals');
  console.log(`referrals: migrated ${rows.length}`);
}

async function migrateWithdrawalRequests() {
  const rows = allRows('withdrawal_requests');
  if (!rows.length) return console.log('withdrawal_requests: nothing to migrate');

  await prisma.withdrawalRequest.createMany({
    data: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      amount: r.amount,
      method: r.method ?? 'bank',
      status: r.status ?? 'pending',
      createdAt: toDate(r.created_at),
      processedAt: r.processed_at ?? null,
    })),
    skipDuplicates: true,
  });
  await resetSequence('withdrawal_requests');
  console.log(`withdrawal_requests: migrated ${rows.length}`);
}

async function main() {
  console.log(`Migrating from ${sqlitePath} ...`);
  // Strict FK-dependency order.
  await migrateUsers();
  await migrateSettings();
  await migrateLinks();
  await migrateOrders();
  await migrateCampaigns();
  await migrateCampaignRewards();
  await migrateReferrals();
  await migrateWithdrawalRequests();
  console.log('Migration complete.');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
