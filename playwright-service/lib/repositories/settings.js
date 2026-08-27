const db = require('../db');

const DEFAULT_COMMISSION_PCT = 70;
const COMMISSION_PCT_KEY = 'commission_pct';

function getCommissionPct() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(COMMISSION_PCT_KEY);
  return row ? Number(row.value) : DEFAULT_COMMISSION_PCT;
}

function setCommissionPct(pct) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(COMMISSION_PCT_KEY, String(pct));
  return getCommissionPct();
}

module.exports = { getCommissionPct, setCommissionPct, DEFAULT_COMMISSION_PCT };
