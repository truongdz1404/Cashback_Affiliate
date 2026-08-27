const db = require('../db');
const { toCamel, toCamelList } = require('../camelize');

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
// system-wide default from lib/repositories/settings.js". Admin-facing only
// (unlike getById, which internal bot logic reads snake_case fields from) -
// safe to camelize.
function setCommissionPct(userId, pct) {
  db.prepare(
    "UPDATE users SET commission_pct = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(pct === null || pct === undefined ? null : Number(pct), userId);
  return toCamel(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
}

// Admin-facing only - safe to camelize.
function listAll() {
  return toCamelList(db.prepare('SELECT * FROM users ORDER BY id DESC').all());
}

function getById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) || null;
}

// Used by the admin dashboard's edit-in-place forms - any field left
// undefined/null is left unchanged rather than cleared. Admin-facing only -
// safe to camelize.
function updateProfileById(userId, { phone, bankName, bankAccountNumber, bankAccountHolder } = {}) {
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!current) return null;
  db.prepare(
    `UPDATE users SET
       phone = COALESCE(?, phone),
       bank_name = COALESCE(?, bank_name),
       bank_account_number = COALESCE(?, bank_account_number),
       bank_account_holder = COALESCE(?, bank_account_holder),
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(phone ?? null, bankName ?? null, bankAccountNumber ?? null, bankAccountHolder ?? null, userId);
  return toCamel(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
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
  updateProfileById,
};
