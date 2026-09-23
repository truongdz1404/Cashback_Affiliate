// Minimal in-memory sliding-window limiter (see server.js) - an app APK is
// public and unauthenticated at the register/login step, so it needs some
// throttling against password-guessing and spam-registration without pulling
// in a dependency. Per-process memory is fine here: this service runs as a
// single instance (see browserManager's own singleton assumptions elsewhere
// in this codebase).
const hits = new Map();

// Last time a full sweep ran. Without one, `hits` grows by one entry for
// every distinct IP that ever touched a limited route and never shrinks -
// the entries expire logically, but the Map keys stay forever. Swept lazily
// on request rather than on a timer so it costs nothing while idle and never
// holds the process open.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

function sweep(now, windowMs) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, timestamps] of hits) {
    if (timestamps.length === 0 || now - timestamps[timestamps.length - 1] >= windowMs) {
      hits.delete(key);
    }
  }
}

/**
 * `by` picks the bucket. The default is the caller's IP, which is only
 * meaningful because server.js sets `trust proxy` - behind nginx without it,
 * req.ip is the proxy's own address, so every user in the world shares one
 * bucket and the twenty-first login of the quarter-hour fails for everybody.
 *
 * Routes that sit behind requireAppUser pass a `by` that returns the user id
 * instead: those are rate-limited to protect a scarce server resource (the
 * two-tab Playwright pool a link mint occupies for several seconds), not to
 * stop guessing, and an id is both more precise and not shared by a whole
 * office behind one NAT.
 */
function rateLimit({ windowMs, max, by }) {
  return (req, res, next) => {
    const now = Date.now();
    sweep(now, windowMs);

    const key = `${max}:${windowMs}:${(by ? by(req) : null) ?? req.ip}`;
    const timestamps = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= max) {
      const retryAfterMs = windowMs - (now - timestamps[0]);
      res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
      return res.status(429).json({ error: 'too many requests, please try again later', retryAfterMs });
    }
    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

module.exports = { rateLimit };
