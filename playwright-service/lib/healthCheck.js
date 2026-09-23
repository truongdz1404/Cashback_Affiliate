const net = require('net');
const configStore = require('./configStore');
const settingsRepo = require('./repositories/settings');
const { getTransporter } = require('./mailer');

const TIMEOUT_MS = 8000;
const DOWN_STATE_KEY = 'health_check_down_state';

// HTTP services: any response (even 4xx/5xx) = UP; network error/timeout = DOWN
// TCP services: successful connection = UP
const SERVICES = [
  { name: 'nginx + bot.tro247.online',         type: 'http', url: 'https://bot.tro247.online/' },
  { name: 'nginx + tro247.online',             type: 'http', url: 'https://tro247.online/' },
  { name: 'nginx + app.tro247.online',         type: 'http', url: 'https://app.tro247.online/' },
  { name: 'nginx + refundmoney.tro247.online', type: 'http', url: 'https://refundmoney.tro247.online/' },
  { name: 'nginx + n8n.tro247.online',         type: 'http', url: 'https://n8n.tro247.online/' },
  { name: 'PostgreSQL shopee-affiliate',       type: 'tcp',  host: 'shopee-affiliate-db', port: 5432 },
  { name: 'PostgreSQL tro247 [:5432]',         type: 'tcp',  host: '42.96.13.38',      port: 5432 },
  { name: 'Zalo Bot API',                      type: 'zalo' },
];

/**
 * Which services are currently down, and when each was last alerted about.
 *
 * Backed by a settings row rather than living only in RAM, because this repo
 * auto-deploys on every push to master: a container restart used to wipe the
 * map, so the very next tick saw every still-down service as *newly* down and
 * mailed about it again. Anything still broken therefore generated one alert
 * per deploy on top of the hourly re-alert - which is what trained everyone to
 * ignore these emails. Persisting it means a restart changes nothing about
 * what gets sent.
 */
const downState = new Map();
let stateLoaded = false;

async function loadDownState() {
  if (stateLoaded) return;
  stateLoaded = true; // even on failure: a missing row must not retry forever
  try {
    const row = await settingsRepo.getRaw(DOWN_STATE_KEY);
    const parsed = row && row.value ? JSON.parse(row.value) : null;
    if (!parsed || typeof parsed !== 'object') return;
    const known = new Set(SERVICES.map((s) => s.name));
    for (const [name, v] of Object.entries(parsed)) {
      // Drop entries for services that have since been renamed or removed
      // from SERVICES, otherwise they'd sit in the row forever unreferenced.
      if (!known.has(name)) continue;
      downState.set(name, {
        since: new Date(v.since),
        lastAlertAt: new Date(v.lastAlertAt),
      });
    }
  } catch (err) {
    console.warn('health-check: could not load down state:', err.message);
  }
}

async function saveDownState() {
  try {
    const plain = {};
    for (const [name, v] of downState) {
      plain[name] = { since: v.since.toISOString(), lastAlertAt: v.lastAlertAt.toISOString() };
    }
    await settingsRepo.setRaw(DOWN_STATE_KEY, JSON.stringify(plain));
  } catch (err) {
    console.warn('health-check: could not save down state:', err.message);
  }
}

async function checkHttp(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Any HTTP response means the server is up (even 4xx/5xx)
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message.replace(/\n/g, ' ').slice(0, 120) };
  }
}

function checkTcp(host, port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (ok, reason) => { sock.destroy(); resolve({ ok, reason }); };
    sock.setTimeout(TIMEOUT_MS);
    sock.on('connect', () => done(true));
    sock.on('error',   (e) => done(false, e.code));
    sock.on('timeout', () => done(false, 'timeout'));
    sock.connect(port, host);
  });
}

async function checkZalo() {
  try {
    const token = await configStore.get('zaloBotToken');
    if (!token) return { ok: false, reason: 'token not configured' };
    const res = await fetch(`https://bot-api.zaloplatforms.com/bot${token}/getMe`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    if (json && json.ok) return { ok: true };
    return { ok: false, reason: `API: ${JSON.stringify(json)}` };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function runChecks() {
  const results = [];
  for (const svc of SERVICES) {
    let r;
    if (svc.type === 'http') {
      r = await checkHttp(svc.url);
    } else if (svc.type === 'tcp') {
      r = await checkTcp(svc.host, svc.port);
    } else if (svc.type === 'zalo') {
      r = await checkZalo();
    }
    results.push({ name: svc.name, ...r });
  }
  return results;
}

async function sendAlert(items, subject, emoji) {
  const to         = process.env.ALERT_EMAIL_TO;
  const from       = process.env.ALERT_EMAIL_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();
  if (!transporter || !to) {
    console.warn('health-check: SMTP not configured, skipping email');
    return;
  }
  const now      = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const textList = items.map(f => `  - ${f.name}${f.reason ? ': ' + f.reason : ''}`).join('\n');
  const htmlList = items.map(f => `<li><strong>${f.name}</strong>${f.reason ? ': ' + f.reason : ''}</li>`).join('');
  await transporter.sendMail({
    from: `"VPS Monitor 247" <${from}>`,
    to,
    subject: `${emoji} ${subject}`,
    text:  `${subject}\nThoi gian: ${now}\nVPS: 42.96.13.38\n\n${textList}`,
    html:  `<h2>${emoji} ${subject}</h2><p>Thoi gian: <strong>${now}</strong> | VPS: 42.96.13.38</p><ul>${htmlList}</ul>`,
  });
  console.log(`health-check: alert email sent to ${to}`);
}

async function runHealthCheck() {
  await loadDownState();
  const results = await runChecks();
  const nowMs   = Date.now();

  const newlyDown = [];
  const reAlerts  = [];
  const recovered = [];

  for (const r of results) {
    const wasDown = downState.has(r.name);
    if (!r.ok) {
      if (!wasDown) {
        downState.set(r.name, { since: new Date(), lastAlertAt: new Date() });
        newlyDown.push(r);
      } else {
        const state = downState.get(r.name);
        // Re-alert after 1 hour if still down
        if (nowMs - state.lastAlertAt.getTime() >= 60 * 60 * 1000) {
          state.lastAlertAt = new Date();
          reAlerts.push(r);
        }
      }
    } else if (wasDown) {
      recovered.push(r);
      downState.delete(r.name);
    }
  }

  const failed = results.filter(r => !r.ok);
  const passed = results.filter(r => r.ok);
  console.log(
    `health-check: ${passed.length}/${results.length} OK` +
    (failed.length ? ` | DOWN: ${failed.map(r => r.name).join(', ')}` : '')
  );

  if (newlyDown.length || reAlerts.length || recovered.length) {
    await saveDownState();
  }

  if (newlyDown.length || reAlerts.length) {
    await sendAlert(
      [...newlyDown, ...reAlerts],
      `[${newlyDown.length + reAlerts.length} dich vu loi] VPS 42.96.13.38`,
      '🚨'
    ).catch(err => console.error('health-check: email error', err.message));
  }
  if (recovered.length) {
    await sendAlert(
      recovered,
      `[${recovered.length} dich vu phuc hoi] VPS 42.96.13.38`,
      '✅'
    ).catch(err => console.error('health-check: recovery email error', err.message));
  }
}

module.exports = { runHealthCheck };
