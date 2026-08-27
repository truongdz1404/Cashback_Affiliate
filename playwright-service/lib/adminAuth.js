const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === 'change-me') {
    throw new Error('JWT_SECRET is not configured on the server (.env)');
  }
  return secret;
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

module.exports = { issueToken, requireAdmin };
