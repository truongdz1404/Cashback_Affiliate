// Minimal in-memory sliding-window limiter for /app/register and /app/login
// (see server.js) - an app APK is public and unauthenticated at that point,
// so it needs some throttling against password-guessing/spam-registration
// without pulling in a dependency for two routes. Per-process memory is fine
// here: this service runs as a single instance (see browserManager's own
// singleton assumptions elsewhere in this codebase).
const hits = new Map();

function rateLimit({ windowMs, max }) {
  return (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    const timestamps = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= max) {
      return res.status(429).json({ error: 'too many requests, please try again later' });
    }
    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

module.exports = { rateLimit };
