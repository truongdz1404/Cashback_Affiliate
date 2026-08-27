const jwt = require('jsonwebtoken');
const db = require('./db');
const configStore = require('./configStore');
const passwordHash = require('./passwordHash');

const ADMIN_PASSWORD_HASH_KEY = 'admin_password_hash';

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
  const hash = passwordHash.hashPassword(envPassword);
  storeAdminPasswordHash(hash);
  return hash;
}

function checkAdminPassword(password) {
  return passwordHash.verifyPassword(password, getAdminPasswordHash());
}

function setAdminPassword(newPassword) {
  storeAdminPasswordHash(passwordHash.hashPassword(newPassword));
}

function getJwtSecret() {
  return configStore.get('jwtSecret');
}

function issueToken() {
  return jwt.sign({ role: 'admin' }, getJwtSecret(), { expiresIn: '12h' });
}

// Protects /admin/* routes: expects "Authorization: Bearer <token>" from a
// prior POST /admin/login. Also checks the `role` claim, not just the
// signature - the app-user JWTs issued by lib/appAuth.js share this same
// jwtSecret, so without this check a logged-in app user's token would also
// pass as an admin token.
function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing Authorization: Bearer <token> header' });

  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'admin token required' });
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid or expired admin token' });
  }
}

module.exports = { issueToken, requireAdmin, checkAdminPassword, setAdminPassword };
