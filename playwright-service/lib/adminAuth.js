const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');
const configStore = require('./configStore');

const ADMIN_PASSWORD_HASH_KEY = 'admin_password_hash';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function storeAdminPasswordHash(hash) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(ADMIN_PASSWORD_HASH_KEY, hash);
}

// The password is only ever kept as a salted hash in the `settings` table.
// On first use (no hash stored yet), it's seeded from the ADMIN_PASSWORD env
// var so an already-deployed install keeps working with what's in .env,
// after which /admin/password (see server.js) is the only way to change it.
function getAdminPasswordHash() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(ADMIN_PASSWORD_HASH_KEY);
  if (row) return row.value;

  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envPassword || envPassword === 'change-me') {
    throw new Error('ADMIN_PASSWORD is not configured on the server (.env) and no password has been set yet');
  }
  const hash = hashPassword(envPassword);
  storeAdminPasswordHash(hash);
  return hash;
}

function checkAdminPassword(password) {
  return verifyPassword(password, getAdminPasswordHash());
}

function setAdminPassword(newPassword) {
  storeAdminPasswordHash(hashPassword(newPassword));
}

function getJwtSecret() {
  return configStore.get('jwtSecret');
}

function issueToken() {
  return jwt.sign({ role: 'admin' }, getJwtSecret(), { expiresIn: '12h' });
}

// Protects /admin/* routes: expects "Authorization: Bearer <token>" from a
// prior POST /admin/login.
function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing Authorization: Bearer <token> header' });

  try {
    jwt.verify(token, getJwtSecret());
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid or expired admin token' });
  }
}

module.exports = { issueToken, requireAdmin, checkAdminPassword, setAdminPassword };
