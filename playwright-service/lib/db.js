const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './storage/app.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zalo_user_id TEXT UNIQUE NOT NULL,
    phone TEXT,
    bank_name TEXT,
    bank_account_number TEXT,
    bank_account_holder TEXT,
    commission_pct REAL,
    password_hash TEXT,
    referral_code TEXT,
    referred_by_user_id INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    item_id TEXT,
    sub_id TEXT UNIQUE NOT NULL,
    shopee_url TEXT,
    affiliate_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_sn TEXT UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id),
    sub_id TEXT,
    total_commission REAL,
    user_commission REAL,
    operator_commission REAL,
    display_order_status INTEGER,
    payout_status TEXT NOT NULL DEFAULT 'unpaid',
    paid_at TEXT,
    purchase_time TEXT,
    raw_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Milestone/tier reward campaigns (e.g. "3 don -> 6.000d"). tiers_json is a
  -- JSON array of {orders, reward}, edited as one blob from the admin
  -- dashboard rather than needing its own tiers table.
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    starts_at TEXT,
    ends_at TEXT,
    tiers_json TEXT NOT NULL DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per tier a user has actually reached, so a tier can never be
  -- granted twice (UNIQUE below) and payout can be tracked the same way as
  -- orders.payout_status.
  CREATE TABLE IF NOT EXISTS campaign_rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    order_threshold INTEGER NOT NULL,
    reward_amount REAL NOT NULL,
    payout_status TEXT NOT NULL DEFAULT 'unpaid',
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(campaign_id, user_id, order_threshold)
  );

  -- A user can only be referred once (referred_user_id UNIQUE). status
  -- moves pending -> qualified when the referred user's first order
  -- completes (see lib/repositories/referrals.js).
  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_user_id INTEGER NOT NULL REFERENCES users(id),
    referred_user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending',
    reward_amount REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    qualified_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_links_sub_id ON links(sub_id);
  CREATE INDEX IF NOT EXISTS idx_orders_sub_id ON orders(sub_id);
  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_campaign_rewards_user_id ON campaign_rewards(user_id);
  CREATE INDEX IF NOT EXISTS idx_referrals_referrer_user_id ON referrals(referrer_user_id);
`);

// CREATE TABLE IF NOT EXISTS doesn't add columns to a table that already
// exists from before this column was introduced (e.g. the users table on
// already-deployed installs) - patch it in by hand, once, if missing.
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('commission_pct')) {
  db.exec('ALTER TABLE users ADD COLUMN commission_pct REAL');
}
if (!userColumns.includes('password_hash')) {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
}
if (!userColumns.includes('referral_code')) {
  // SQLite's ALTER TABLE ADD COLUMN can't carry a UNIQUE constraint - added
  // as a separate index below instead (works the same for a fresh install,
  // since the column itself is plain TEXT in the CREATE TABLE above too).
  db.exec('ALTER TABLE users ADD COLUMN referral_code TEXT');
}
if (!userColumns.includes('referred_by_user_id')) {
  db.exec('ALTER TABLE users ADD COLUMN referred_by_user_id INTEGER REFERENCES users(id)');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)');

const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
if (!orderColumns.includes('payout_status')) {
  db.exec("ALTER TABLE orders ADD COLUMN payout_status TEXT NOT NULL DEFAULT 'unpaid'");
}
if (!orderColumns.includes('paid_at')) {
  db.exec('ALTER TABLE orders ADD COLUMN paid_at TEXT');
}

module.exports = db;
