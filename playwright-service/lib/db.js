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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    purchase_time TEXT,
    raw_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_links_sub_id ON links(sub_id);
  CREATE INDEX IF NOT EXISTS idx_orders_sub_id ON orders(sub_id);
  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
`);

module.exports = db;
