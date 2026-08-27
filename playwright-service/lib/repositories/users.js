const crypto = require('crypto');
const db = require('../db');
const { toCamel, toCamelList } = require('../camelize');
const passwordHash = require('../passwordHash');

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

function findByPhone(phone) {
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) || null;
}

function findByReferralCode(code) {
  if (!code) return null;
  return db.prepare('SELECT * FROM users WHERE referral_code = ?').get(code) || null;
}

// referral_code is generated lazily (on first need) rather than at row
// creation time, so bot-created rows (which never call this) don't carry
// dead codes. Collision retry is essentially never hit at this scale but
// costs nothing to guard.
function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex');
}

function ensureReferralCode(userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  if (user.referral_code) return user.referral_code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      db.prepare("UPDATE users SET referral_code = ?, updated_at = datetime('now') WHERE id = ?").run(code, userId);
      return code;
    } catch (err) {
      if (!/UNIQUE/.test(err.message)) throw err;
    }
  }
  throw new Error('could not generate a unique referral code');
}

// Registers a brand-new app user. Callers must have already checked the
// phone isn't taken (see server.js POST /app/register) - this always
// inserts a fresh row rather than merging into an existing bot-created one
// (see mergeIntoExistingByPhone for that case). zalo_user_id is a synthetic
// "app:<hex>" placeholder so it satisfies the existing UNIQUE NOT NULL
// constraint without colliding with a real numeric Zalo ID.
function createAppUser(phone, password, referredByUserId) {
  const zaloUserId = `app:${crypto.randomBytes(8).toString('hex')}`;
  const hash = passwordHash.hashPassword(password);
  const result = db
    .prepare(
      `INSERT INTO users (zalo_user_id, phone, password_hash, referred_by_user_id)
       VALUES (?, ?, ?, ?)`
    )
    .run(zaloUserId, phone, hash, referredByUserId ?? null);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
}

// Attaches app login to an existing bot-created row found by phone, so the
// user inherits their prior order history instead of starting a fresh row.
function setPassword(userId, password) {
  const hash = passwordHash.hashPassword(password);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, userId);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function setReferredBy(userId, referredByUserId) {
  db.prepare("UPDATE users SET referred_by_user_id = ?, updated_at = datetime('now') WHERE id = ?").run(
    referredByUserId,
    userId
  );
}

function verifyLogin(phone, password) {
  const user = findByPhone(phone);
  if (!user || !user.password_hash) return null;
  if (!passwordHash.verifyPassword(password, user.password_hash)) return null;
  return user;
}

// App-facing responses must never leak password_hash - strip it after
// camelizing rather than remembering to omit it at every call site.
function toPublicAppUser(user) {
  if (!user) return null;
  const camelized = toCamel(user);
  delete camelized.passwordHash;
  return camelized;
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
  findByPhone,
  findByReferralCode,
  ensureReferralCode,
  createAppUser,
  setPassword,
  setReferredBy,
  verifyLogin,
  toPublicAppUser,
};
