const jwt = require('jsonwebtoken');
const configStore = require('./configStore');
const usersRepo = require('./repositories/users');

// There is no separate admin login any more. An administrator is an ordinary
// account (phone/password, Google or Facebook - see /app/login*) whose
// users.role is "admin". The website shows that person an extra "Trang quản
// trị" entry; everyone else never learns the dashboard exists (/admin/* on
// the web answers 404 for them, and the API below answers 403).

async function getJwtSecret() {
  return configStore.get('jwtSecret');
}

// Comma-separated ADMIN_EMAILS is the bootstrap path: the very first admin
// can't be promoted from a dashboard nobody can open yet. Any account that
// signs in with (or already carries) one of these addresses is promoted on
// the spot - see syncRoleFromAllowlist. Defaults to the one known operator
// account so an install with no env override still has a way in.
function isAdminEmail(email) {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS || 'truongvq.se@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(String(email).trim().toLowerCase());
}

// Called on every sign-in and on GET /app/me. Only ever promotes: removing
// an address from ADMIN_EMAILS must not silently demote an admin who was
// (also) granted the role through the dashboard.
async function syncRoleFromAllowlist(user) {
  if (!user || user.role === 'admin' || !isAdminEmail(user.email)) return user;
  return (await usersRepo.setRole(user.id, 'admin')) || user;
}

// Protects /admin/* routes: expects "Authorization: Bearer <token>" carrying
// the SAME app_user JWT that /app/* uses (lib/appAuth.js), then checks the
// live users.role in the database - not a claim baked into the token - so
// revoking someone's admin role takes effect on their very next request
// rather than when their 30-day token finally expires.
//
// Sets req.adminUser (the full row) for handlers that need to know who is
// acting, e.g. the self-demotion guard on PUT /admin/users/:id/role.
async function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing Authorization: Bearer <token> header' });

  let decoded;
  try {
    decoded = jwt.verify(token, await getJwtSecret());
  } catch {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
  if (decoded.role !== 'app_user' || !decoded.sub) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }

  try {
    const user = await usersRepo.getById(decoded.sub);
    if (!user) return res.status(401).json({ error: 'invalid or expired token' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'admin role required' });
    req.adminUser = user;
    req.appUserId = user.id;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { requireAdmin, isAdminEmail, syncRoleFromAllowlist };
