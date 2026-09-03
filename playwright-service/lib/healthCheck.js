const net = require('net');
const nodemailer = require('nodemailer');
const configStore = require('./configStore');

const TIMEOUT_MS = 8000;

// HTTP services: any response (even 4xx/5xx) = UP; network error/timeout = DOWN
// TCP services: successful connection = UP
const SERVICES = [
  { name: 'nginx + bot.tro247.online',         type: 'http', url: 'https://bot.tro247.online/' },
  { name: 'nginx + tro247.online',             type: 'http', url: 'https://tro247.online/' },
  { name: 'nginx + app.tro247.online',         type: 'http', url: 'https://app.tro247.online/' },
  { name: 'nginx + refundmoney.tro247.online', type: 'http', url: 'https://refundmoney.tro247.online/' },
  { name: 'nginx + n8n.tro247.online',         type: 'http', url: 'https://n8n.tro247.online/' },
  { name: 'PostgreSQL shopee-affiliate',       type: 'tcp',  host: 'shopee-affiliate-db', port: 5432 },
  { name: 'PostgreSQL tro247 [:5432]',         type: 'tcp',  host: '103.161.17.137',      port: 5432 },
  { name: 'Zalo Bot API',                      type: 'zalo' },
];

// In-memory state: track when each service went down and last alert time
const downState = new Map();

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

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
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
    text:  `${subject}\nThoi gian: ${now}\nVPS: 103.161.17.137\n\n${textList}`,
    html:  `<h2>${emoji} ${subject}</h2><p>Thoi gian: <strong>${now}</strong> | VPS: 103.161.17.137</p><ul>${htmlList}</ul>`,
  });
  console.log(`health-check: alert email sent to ${to}`);
}

async function runHealthCheck() {
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

  if (newlyDown.length || reAlerts.length) {
    await sendAlert(
      [...newlyDown, ...reAlerts],
      `[${newlyDown.length + reAlerts.length} dich vu loi] VPS 103.161.17.137`,
      '🚨'
    ).catch(err => console.error('health-check: email error', err.message));
  }
  if (recovered.length) {
    await sendAlert(
      recovered,
      `[${recovered.length} dich vu phuc hoi] VPS 103.161.17.137`,
      '✅'
    ).catch(err => console.error('health-check: recovery email error', err.message));
  }
}

module.exports = { runHealthCheck };
