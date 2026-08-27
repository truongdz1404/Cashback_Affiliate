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

  CREATE INDEX IF NOT EXISTS idx_links_sub_id ON links(sub_id);
  CREATE INDEX IF NOT EXISTS idx_orders_sub_id ON orders(sub_id);
  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
`);

// CREATE TABLE IF NOT EXISTS doesn't add columns to a table that already
// exists from before this column was introduced (e.g. the users table on
// already-deployed installs) - patch it in by hand, once, if missing.
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userColumns.includes('commission_pct')) {
  db.exec('ALTER TABLE users ADD COLUMN commission_pct REAL');
}

const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
if (!orderColumns.includes('payout_status')) {
  db.exec("ALTER TABLE orders ADD COLUMN payout_status TEXT NOT NULL DEFAULT 'unpaid'");
}
if (!orderColumns.includes('paid_at')) {
  db.exec('ALTER TABLE orders ADD COLUMN paid_at TEXT');
}

module.exports = db;
