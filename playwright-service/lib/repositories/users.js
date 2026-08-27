const db = require('../db');

function getOrCreateUserByZaloId(zaloUserId) {
  const existing = db.prepare('SELECT * FROM users WHERE zalo_user_id = ?').get(zaloUserId);
  if (existing) return existing;

  db.prepare('INSERT INTO users (zalo_user_id) VALUES (?)').run(zaloUserId);
  return db.prepare('SELECT * FROM users WHERE zalo_user_id = ?').get(zaloUserId);
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

module.exports = { getOrCreateUserByZaloId, updatePhone, updatePayment, getPayment };
