const jwt = require('jsonwebtoken');
const configStore = require('./configStore');

async function getJwtSecret() {
  return configStore.get('jwtSecret');
}

// 30 days - re-logging in on a phone is a lot more disruptive than on the
// web admin dashboard, so app-user tokens live much longer than admin ones
// (lib/adminAuth.js). Both share the same jwtSecret; rotating it (see
// /admin/config/jwtSecret) logs everyone out, admin and app users alike.
async function issueAppToken(userId) {
  return jwt.sign({ role: 'app_user', sub: userId }, await getJwtSecret(), { expiresIn: '30d' });
}

// Protects /app/* routes (aside from /app/register and /app/login): expects
// "Authorization: Bearer <token>" from a prior POST /app/login. Sets
// req.appUserId to the numeric users.id carried in the token's `sub` claim.
async function requireAppUser(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing Authorization: Bearer <token> header' });

  try {
    const decoded = jwt.verify(token, await getJwtSecret());
    if (decoded.role !== 'app_user' || !decoded.sub) {
      return res.status(403).json({ error: 'app user token required' });
    }
    req.appUserId = decoded.sub;
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

// Same token check as requireAppUser, but never rejects: the public website
// (the client) renders the catalog, banners and campaigns for logged-out
// visitors too, and the same routes must serve personalized data the moment a
// token IS present. Callers MUST treat req.appUserId === null as "anonymous"
// and skip anything user-scoped (personalized ranking, search history).
async function optionalAppUser(req, _res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.appUserId = null;
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, await getJwtSecret());
    if (decoded.role === 'app_user' && decoded.sub) req.appUserId = decoded.sub;
  } catch {
    // An expired/invalid token on a public route degrades to anonymous rather
    // than 401 - a stale cookie must not break browsing the site.
  }
  next();
}

module.exports = { issueAppToken, requireAppUser, optionalAppUser };
