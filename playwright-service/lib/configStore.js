const crypto = require('crypto');
const db = require('./db');

// Secrets that used to live only in .env, now live-editable from the admin
// dashboard (lib/adminAuth.js + the /admin/config routes in server.js)
// without a container restart: each is backed by a row in the `settings`
// table and re-read on every use, so a change takes effect on the very next
// request. The first read of a key that has no row yet seeds one from the
// matching env var (so upgrading an already-deployed install doesn't lose
// what's in .env), or - for keys marked `generate` - from a fresh random
// value if no env var is set either.
//
// SERVICE_API_KEY is deliberately NOT here: admin-web's own server holds a
// copy of it to authenticate its calls into this service, and that copy
// isn't wired to follow a change made here. Making it editable from this
// dashboard would risk locking the dashboard out of its own API with no way
// back in except SSH. Rotate it via .env + redeploy instead.
const KEYS = {
  zaloBotToken: { settingKey: 'zalo_bot_token', envName: 'ZALO_BOT_TOKEN', generate: false },
  zaloWebhookSecret: { settingKey: 'zalo_webhook_secret', envName: 'ZALO_WEBHOOK_SECRET', generate: false },
  jwtSecret: { settingKey: 'jwt_secret', envName: 'JWT_SECRET', generate: true },
};

function readSetting(settingKey) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(settingKey);
  return row ? row.value : null;
}

function writeSetting(settingKey, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(settingKey, value);
}

function get(name) {
  const spec = KEYS[name];
  if (!spec) throw new Error(`unknown config key: ${name}`);

  const stored = readSetting(spec.settingKey);
  if (stored !== null) return stored;

  const fromEnv = process.env[spec.envName];
  if (fromEnv && fromEnv !== 'change-me') {
    writeSetting(spec.settingKey, fromEnv);
    return fromEnv;
  }
  if (spec.generate) {
    const seeded = crypto.randomBytes(24).toString('hex');
    writeSetting(spec.settingKey, seeded);
    return seeded;
  }
  return null;
}

function set(name, value) {
  const spec = KEYS[name];
  if (!spec) throw new Error(`unknown config key: ${name}`);
  writeSetting(spec.settingKey, value);
  return value;
}

// Never echo a stored secret back to a client in full - only enough to tell
// two values apart at a glance.
function mask(value) {
  if (!value) return null;
  if (value.length <= 4) return '••••';
  return `••••${value.slice(-4)}`;
}

module.exports = { get, set, mask, KEYS };
