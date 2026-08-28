const jwt = require('jsonwebtoken');
const prisma = require('./prisma');
const configStore = require('./configStore');
const passwordHash = require('./passwordHash');

const ADMIN_PASSWORD_HASH_KEY = 'admin_password_hash';

async function storeAdminPasswordHash(hash) {
  await prisma.setting.upsert({
    where: { key: ADMIN_PASSWORD_HASH_KEY },
    create: { key: ADMIN_PASSWORD_HASH_KEY, value: hash },
    update: { value: hash },
  });
}

// The password is only ever kept as a salted hash in the `settings` table.
// On first use (no hash stored yet), it's seeded from the ADMIN_PASSWORD env
// var so an already-deployed install keeps working with what's in .env,
// after which /admin/password (see server.js) is the only way to change it.
async function getAdminPasswordHash() {
  const row = await prisma.setting.findUnique({ where: { key: ADMIN_PASSWORD_HASH_KEY } });
  if (row) return row.value;

  const envPassword = process.env.ADMIN_PASSWORD;
  if (!envPassword || envPassword === 'change-me') {
    throw new Error('ADMIN_PASSWORD is not configured on the server (.env) and no password has been set yet');
  }
  const hash = passwordHash.hashPassword(envPassword);
  await storeAdminPasswordHash(hash);
  return hash;
}

async function checkAdminPassword(password) {
  return passwordHash.verifyPassword(password, await getAdminPasswordHash());
}

async function setAdminPassword(newPassword) {
  await storeAdminPasswordHash(passwordHash.hashPassword(newPassword));
}

async function getJwtSecret() {
  return configStore.get('jwtSecret');
}

async function issueToken() {
  return jwt.sign({ role: 'admin' }, await getJwtSecret(), { expiresIn: '12h' });
}

// Protects /admin/* routes: expects "Authorization: Bearer <token>" from a
// prior POST /admin/login. Also checks the `role` claim, not just the
// signature - the app-user JWTs issued by lib/appAuth.js share this same
// jwtSecret, so without this check a logged-in app user's token would also
// pass as an admin token.
async function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing Authorization: Bearer <token> header' });

  try {
    const decoded = jwt.verify(token, await getJwtSecret());
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'admin token required' });
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid or expired admin token' });
  }
}

module.exports = { issueToken, requireAdmin, checkAdminPassword, setAdminPassword };
