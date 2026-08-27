const db = require('../db');

function getOrCreateUserByZaloId(zaloUserId) {
  const existing = db.prepare('SELECT * FROM users WHERE zalo_user_id = ?').get(zaloUserId);
  if (existing) return existing;

  db.prepare('INSERT INTO users (zalo_user_id) VALUES (?)').run(zaloUserId);
  return db.prepare('SELECT * FROM users WHERE zalo_user_id = ?').get(zaloUserId);
}

// Used to decide whether to send the one-time welcome message - checked
// (and the row created via getOrCreateUserByZaloId) before any command
// handling runs, so a user's very first message is always caught regardless
// of what it says (invalid command, plain text, etc).
function isNewUser(zaloUserId) {
  return !db.prepare('SELECT id FROM users WHERE zalo_user_id = ?').get(zaloUserId);
}

function updatePhone(zaloUserId, phone) {
  const user = getOrCreateUserByZaloId(zaloUserId);
  db.prepare(
    "UPDATE users SET phone = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(phone, user.id);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
}

function updatePayment(zaloUserId, { bankName, accountNumber, accountHolder }) {
  const user = getOrCreateUserByZaloId(zaloUserId);
  db.prepare(
    `UPDATE users
     SET bank_name = ?, bank_account_number = ?, bank_account_holder = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(bankName, accountNumber, accountHolder, user.id);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
}

function getPayment(zaloUserId) {
  return db.prepare('SELECT * FROM users WHERE zalo_user_id = ?').get(zaloUserId) || null;
}

// Per-user commission_pct override (nullable). Null means "use the
// system-wide default from lib/repositories/settings.js".
function setCommissionPct(userId, pct) {
  db.prepare(
    "UPDATE users SET commission_pct = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(pct === null || pct === undefined ? null : Number(pct), userId);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function listAll() {
  return db.prepare('SELECT * FROM users ORDER BY id DESC').all();
}

function getById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
}

module.exports = {
  getOrCreateUserByZaloId,
  updatePhone,
  updatePayment,
  getPayment,
  isNewUser,
  setCommissionPct,
  listAll,
  getById,
};
