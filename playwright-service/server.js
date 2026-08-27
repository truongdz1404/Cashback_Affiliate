require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const browserManager = require('./lib/browserManager');
const { getCustomLinks } = require('./lib/customLink');
const { getCommission } = require('./lib/commission');
const { getLinkAndCommission } = require('./lib/linkAndCommission');
const linkTracking = require('./lib/linkTracking');
const usersRepo = require('./lib/repositories/users');
const ordersRepo = require('./lib/repositories/orders');
const settingsRepo = require('./lib/repositories/settings');
const zaloBot = require('./lib/zaloBot');
const zaloMessageHandler = require('./lib/zaloMessageHandler');
const adminAuth = require('./lib/adminAuth');
const configStore = require('./lib/configStore');
const { reconcileOrders } = require('./lib/reconciliation');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.SERVICE_API_KEY;

// Zalo calls this directly (its own secret token, not our x-api-key), so it
// must be registered before the x-api-key middleware below. Ack immediately
// (mirrors the old n8n webhook's responseMode "onReceived") and do the real
// work after responding - Zalo doesn't wait around for a slow reply.
app.post('/zalo-webhook', (req, res) => {
  res.sendStatus(200);

  const secret = req.get('x-bot-api-secret-token');
  const expected = configStore.get('zaloWebhookSecret');
  if (!expected || secret !== expected) return;

  // Zalo posts the event at the top level of the body (no "result" wrapper).
  const result = req.body;
  if (!result) return;

  // Zalo auto-converts a bare link into a rich preview card client-side and,
  // when that happens, delivers this event instead of message.text.received -
  // with no text payload at all, so there's nothing to parse here, only a
  // canned reply telling the user how to resend it.
  if (result.event_name === 'message.unsupported.received') {
    const unsupportedChatId = result.message && result.message.chat && result.message.chat.id;
    if (!unsupportedChatId) return;
    zaloBot
      .sendMessage(unsupportedChatId, zaloMessageHandler.UNSUPPORTED_LINK_TEXT)
      .then((r) => console.log(`zalo-webhook: unsupported-link reply result=${JSON.stringify(r)}`))
      .catch((err) => console.error('zalo-webhook: unsupported-link reply failed', err.message));
    return;
  }

  if (result.event_name !== 'message.text.received') return;

  const text = result.message && result.message.text;
  const chatId = result.message && result.message.chat && result.message.chat.id;
  if (!chatId) return;

  (async () => {
    const isNewUser = usersRepo.isNewUser(chatId);
    const user = usersRepo.getOrCreateUserByZaloId(chatId);
    console.log(`zalo-webhook: chatId=${chatId} isNewUser=${isNewUser} userRowId=${user.id}`);
    if (isNewUser) {
      const welcomeResult = await zaloBot.sendMessage(chatId, zaloMessageHandler.WELCOME_TEXT).catch((err) => {
        console.error('zalo-webhook: welcome send failed', err.message);
        return null;
      });
      console.log(`zalo-webhook: welcome sendMessage result=${JSON.stringify(welcomeResult)}`);
    }

    const replyText = await zaloMessageHandler.handleIncomingMessage(text, chatId);
    const replyResult = await zaloBot.sendMessage(chatId, replyText);
    console.log(`zalo-webhook: reply sendMessage result=${JSON.stringify(replyResult)}`);
  })().catch((err) => {
    console.error('zalo-webhook error', err.message);
  });
});

// Simple shared-secret auth so this service isn't wide open to the rest of
// the internet - every route below (aside from /zalo-webhook above, which
// Zalo calls directly and authenticates via its own secret token) requires
// this header.
app.use((req, res, next) => {
  if (!API_KEY || API_KEY === 'change-me') {
    return res.status(500).json({ error: 'SERVICE_API_KEY is not configured on the server (.env)' });
  }
  if (req.get('x-api-key') !== API_KEY) {
    return res.status(401).json({ error: 'invalid or missing x-api-key header' });
  }
  next();
});

// One-off inspection endpoint used while building order reconciliation - hits
// the report/list API with the already-logged-in session's cookies so the
// real response shape (field names, pagination, order status codes) can be
// confirmed before reconciliation.js is written against it.
app.get('/debug/report-list', async (req, res) => {
  try {
    const context = await browserManager.getContext();
    const cookies = await context.cookies();
    const cookieHeader = cookies
      .filter((c) => /shopee/i.test(c.domain))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    const qs = new URLSearchParams({ page_num: 1, page_size: 10, ...req.query }).toString();
    const url = `https://affiliate.shopee.vn/api/v3/report/list?${qs}`;
    const response = await fetch(url, { headers: { cookie: cookieHeader, accept: 'application/json' } });
    const json = await response.json().catch(() => null);
    res.status(response.status).json(json);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { cookies } = req.body;
    if (!cookies) return res.status(400).json({ error: 'body.cookies is required (string or array)' });
    const result = await browserManager.loginWithCookies(cookies);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/status', async (_req, res) => {
  try {
    const result = await browserManager.checkStatus();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/custom-link', async (req, res) => {
  try {
    const { links, subIds, zaloUserId, itemId } = req.body;
    const tracking = linkTracking.prepareSubId(zaloUserId, subIds);
    const result = await getCustomLinks(links, tracking.finalSubIds);
    if (tracking.userId) {
      linkTracking.recordLink(tracking.userId, tracking.subId, links, result, itemId);
    }
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/commission/:pid', async (req, res) => {
  try {
    const result = await getCommission(req.params.pid);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Custom link + commission in one call: the itemId used for the commission
// lookup is read straight out of the custom-link response (see
// lib/customLink.js), so the caller doesn't need to resolve a short link
// into an itemId itself before calling this.
app.post('/link-and-commission', async (req, res) => {
  try {
    const { links, subIds, zaloUserId } = req.body;
    const tracking = linkTracking.prepareSubId(zaloUserId, subIds);
    const result = await getLinkAndCommission(links, tracking.finalSubIds);
    if (tracking.userId) {
      linkTracking.recordLink(tracking.userId, tracking.subId, links, result, result.pid);
    }
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- User profile: phone (for refunds) + payment info (for payouts) ---

app.post('/users/:zaloUserId/phone', (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'body.phone is required' });
    const user = usersRepo.updatePhone(req.params.zaloUserId, phone);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/users/:zaloUserId/payment', (req, res) => {
  try {
    const user = usersRepo.getPayment(req.params.zaloUserId);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/users/:zaloUserId/payment', (req, res) => {
  try {
    const { bankName, accountNumber, accountHolder } = req.body;
    if (!bankName || !accountNumber || !accountHolder) {
      return res.status(400).json({ error: 'bankName, accountNumber, accountHolder are all required' });
    }
    const user = usersRepo.updatePayment(req.params.zaloUserId, { bankName, accountNumber, accountHolder });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Admin dashboard API: JWT-protected (see lib/adminAuth.js), sits behind
// the shared x-api-key middleware above like everything else in this file -
// the future admin-web app is expected to hold the api key server-side and
// only hand the browser the short-lived JWT. ---

app.post('/admin/login', (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'body.password is required' });
    if (!adminAuth.checkAdminPassword(password)) {
      return res.status(401).json({ error: 'invalid password' });
    }
    res.json({ token: adminAuth.issueToken() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/password', adminAuth.requireAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'body.newPassword is required and must be at least 8 characters' });
  }
  adminAuth.setAdminPassword(newPassword);
  // Changing the password doesn't itself invalidate the JWT the caller is
  // using right now, but re-issue one anyway for a consistent response shape
  // with the other rotation endpoints below.
  res.json({ ok: true, token: adminAuth.issueToken() });
});

// Live-editable secrets (Zalo bot token, Zalo webhook secret, admin JWT
// secret) - see lib/configStore.js for why SERVICE_API_KEY is excluded.
// Values are never returned in full, only masked, so the dashboard can show
// "is this set" / "last 4 chars" without round-tripping the real secret.
app.get('/admin/config', adminAuth.requireAdmin, (_req, res) => {
  const out = {};
  for (const key of Object.keys(configStore.KEYS)) {
    out[key] = configStore.mask(configStore.get(key));
  }
  res.json(out);
});

app.put('/admin/config/:key', adminAuth.requireAdmin, (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (!configStore.KEYS[key]) return res.status(400).json({ error: `unknown config key: ${key}` });
  if (!value || typeof value !== 'string') return res.status(400).json({ error: 'body.value is required (string)' });

  configStore.set(key, value);

  const response = { ok: true, masked: configStore.mask(value) };
  // Rotating the JWT secret invalidates the token the caller just used to
  // authenticate this very request - hand back a fresh one so the dashboard
  // can swap it in without forcing an immediate re-login.
  if (key === 'jwtSecret') response.token = adminAuth.issueToken();
  res.json(response);
});

// Shopee affiliate session (the cookie backing browserManager's logged-in
// context) - wraps the existing /login and /status routes behind admin JWT
// auth so the dashboard's browser side never needs the raw x-api-key.
app.get('/admin/session-status', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json(await browserManager.checkStatus());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/admin/session-cookie', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { cookies } = req.body;
    if (!cookies) return res.status(400).json({ error: 'body.cookies is required (string or array)' });
    res.json(await browserManager.loginWithCookies(cookies));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/admin/settings', adminAuth.requireAdmin, (_req, res) => {
  res.json({ commissionPct: settingsRepo.getCommissionPct() });
});

app.put('/admin/settings', adminAuth.requireAdmin, (req, res) => {
  const pct = Number(req.body.commissionPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    return res.status(400).json({ error: 'body.commissionPct must be a number between 0 and 100' });
  }
  res.json({ commissionPct: settingsRepo.setCommissionPct(pct) });
});

app.get('/admin/users', adminAuth.requireAdmin, (_req, res) => {
  res.json(usersRepo.listAll());
});

app.put('/admin/users/:id/commission-pct', adminAuth.requireAdmin, (req, res) => {
  const { commissionPct } = req.body;
  if (commissionPct !== null && commissionPct !== undefined) {
    const pct = Number(commissionPct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'body.commissionPct must be a number between 0 and 100, or null to clear the override' });
    }
  }
  res.json(usersRepo.setCommissionPct(req.params.id, commissionPct));
});

app.put('/admin/users/:id', adminAuth.requireAdmin, (req, res) => {
  const { phone, bankName, bankAccountNumber, bankAccountHolder } = req.body;
  const user = usersRepo.updateProfileById(req.params.id, { phone, bankName, bankAccountNumber, bankAccountHolder });
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json(user);
});

app.get('/admin/users/:id/orders', adminAuth.requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  res.json(ordersRepo.listByUser(req.params.id, { limit, offset }));
});

// Per-customer breakdown: paid vs unpaid completed orders/amounts, plus
// orders still pending Shopee's own confirmation.
app.get('/admin/customers', adminAuth.requireAdmin, (_req, res) => {
  res.json(ordersRepo.customerSummary());
});

app.get('/admin/orders', adminAuth.requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const { payoutStatus, displayStatus } = req.query;
  const opts = { limit, offset, payoutStatus, displayStatus };
  res.json({ orders: ordersRepo.listOrders(opts), total: ordersRepo.countOrders(opts) });
});

app.put('/admin/orders/:id/payout', adminAuth.requireAdmin, (req, res) => {
  res.json(ordersRepo.setPayoutStatus(req.params.id, !!req.body.paid));
});

app.get('/admin/stats', adminAuth.requireAdmin, (_req, res) => {
  res.json(ordersRepo.statsSummary());
});

app.post('/admin/reconcile', adminAuth.requireAdmin, async (_req, res) => {
  try {
    const result = await reconcileOrders();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Shopee affiliate Playwright service listening on http://localhost:${PORT}`);
  // Pre-warm the custom-link tab pool on boot if a session is already
  // persisted on disk, so the very first request doesn't pay the cold-page
  // cost either.
  browserManager.refillCustomLinkPool();
});

// Order reconciliation, every 6 hours - also triggerable on demand via
// POST /admin/reconcile.
cron.schedule('0 */6 * * *', () => {
  reconcileOrders()
    .then((result) => console.log(`cron reconcile: ${JSON.stringify(result)}`))
    .catch((err) => console.error('cron reconcile failed', err.message));
});

process.on('SIGTERM', async () => {
  await browserManager.shutdown();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await browserManager.shutdown();
  process.exit(0);
});
