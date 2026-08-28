require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const browserManager = require('./lib/browserManager');
const { getCustomLinks } = require('./lib/customLink');
const { getCommission } = require('./lib/commission');
const { getLinkAndCommission } = require('./lib/linkAndCommission');
const linkTracking = require('./lib/linkTracking');
const usersRepo = require('./lib/repositories/users');
const linksRepo = require('./lib/repositories/links');
const ordersRepo = require('./lib/repositories/orders');
const settingsRepo = require('./lib/repositories/settings');
const campaignsRepo = require('./lib/repositories/campaigns');
const referralsRepo = require('./lib/repositories/referrals');
const withdrawalsRepo = require('./lib/repositories/withdrawals');
const zaloBot = require('./lib/zaloBot');
const zaloMessageHandler = require('./lib/zaloMessageHandler');
const adminAuth = require('./lib/adminAuth');
const appAuth = require('./lib/appAuth');
const oauthLogin = require('./lib/oauthLogin');
const configStore = require('./lib/configStore');
const { reconcileOrders } = require('./lib/reconciliation');
const { rateLimit } = require('./lib/simpleRateLimit');
const { getEffectivePct, splitAmount } = require('./lib/commissionSplit');

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

  (async () => {
    const secret = req.get('x-bot-api-secret-token');
    const expected = await configStore.get('zaloWebhookSecret');
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
      const r = await zaloBot
        .sendMessage(unsupportedChatId, zaloMessageHandler.UNSUPPORTED_LINK_TEXT)
        .catch((err) => {
          console.error('zalo-webhook: unsupported-link reply failed', err.message);
          return null;
        });
      console.log(`zalo-webhook: unsupported-link reply result=${JSON.stringify(r)}`);
      return;
    }

    if (result.event_name !== 'message.text.received') return;

    const text = result.message && result.message.text;
    const chatId = result.message && result.message.chat && result.message.chat.id;
    if (!chatId) return;

    const isNewUser = await usersRepo.isNewUser(chatId);
    const user = await usersRepo.getOrCreateUserByZaloId(chatId);
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

// --- Mobile app API: JWT-per-user auth (see lib/appAuth.js), registered
// before the shared x-api-key middleware below like /zalo-webhook above -
// the app ships as a public APK that could be decompiled, so it can't hold
// a static shared secret. Every route here is either register/login (no
// auth yet) or protected by appAuth.requireAppUser. CORS is wide open here
// (safe: stateless Bearer-token auth, no cookies) so a web build of the app
// can call it directly too. ---

app.use('/app', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.post('/app/register', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const { phone, password, referralCode } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'phone and password are required' });
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }

    let referrer = null;
    if (referralCode) {
      referrer = await usersRepo.findByReferralCode(referralCode);
      if (!referrer) return res.status(400).json({ error: 'invalid referral code' });
    }

    let user = await usersRepo.findByPhone(phone);
    if (user && user.passwordHash) {
      return res.status(409).json({ error: 'phone already registered' });
    }

    if (user) {
      // Existing bot-created row (from /sdt via Zalo) - attach app login to
      // it instead of creating a duplicate row, so order history carries over.
      user = await usersRepo.setPassword(user.id, password);
      if (referrer && referrer.id !== user.id && !user.referredByUserId) {
        await usersRepo.setReferredBy(user.id, referrer.id);
        user = await usersRepo.getById(user.id);
      }
    } else {
      user = await usersRepo.createAppUser(phone, password, referrer ? referrer.id : null);
    }

    if (referrer && referrer.id !== user.id && !(await referralsRepo.findByReferredUser(user.id))) {
      await referralsRepo.create(referrer.id, user.id);
    }

    res.json({ token: await appAuth.issueAppToken(user.id), user: usersRepo.toPublicAppUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/app/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'phone and password are required' });
    const user = await usersRepo.verifyLogin(phone, password);
    if (!user) return res.status(401).json({ error: 'invalid phone or password' });
    res.json({ token: await appAuth.issueAppToken(user.id), user: usersRepo.toPublicAppUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tells the app which OAuth providers (if any) it can actually offer right
// now, and hands over the Google client ID it needs to build the auth
// request itself - not a secret, so safe to expose. Lets the login screen
// show/hide the Google/Facebook buttons without a guessing round trip.
app.get('/app/oauth-config', async (req, res) => {
  try {
    const googleClientId = await configStore.get('googleClientId');
    const facebookAppId = await configStore.get('facebookAppId');
    res.json({
      google: googleClientId ? { enabled: true, clientId: googleClientId } : { enabled: false },
      facebook: facebookAppId ? { enabled: true, appId: facebookAppId } : { enabled: false },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function handleOAuthLogin(req, res, provider, verify, tokenField) {
  try {
    const token = req.body[tokenField];
    if (!token) return res.status(400).json({ error: `body.${tokenField} is required` });

    let profile;
    try {
      profile = await verify(token);
    } catch (err) {
      if (err.notConfigured) return res.status(501).json({ error: 'not_configured' });
      return res.status(401).json({ error: err.message });
    }

    const user = await usersRepo.findOrCreateOAuthUser({
      provider,
      providerId: profile.providerId,
      email: profile.email,
      name: profile.name,
    });
    res.json({ token: await appAuth.issueAppToken(user.id), user: usersRepo.toPublicAppUser(user) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.post('/app/login/google', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), (req, res) =>
  handleOAuthLogin(req, res, 'google', oauthLogin.verifyGoogleIdToken, 'idToken')
);

app.post('/app/login/facebook', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), (req, res) =>
  handleOAuthLogin(req, res, 'facebook', oauthLogin.verifyFacebookAccessToken, 'accessToken')
);

app.get('/app/me', appAuth.requireAppUser, async (req, res) => {
  try {
    const user = await usersRepo.getById(req.appUserId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json(usersRepo.toPublicAppUser(user));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/app/me', appAuth.requireAppUser, async (req, res) => {
  try {
    const { phone, bankName, bankAccountNumber, bankAccountHolder } = req.body;
    const updated = await usersRepo.updateProfileById(req.appUserId, { phone, bankName, bankAccountNumber, bankAccountHolder });
    if (!updated) return res.status(404).json({ error: 'user not found' });
    res.json(usersRepo.toPublicAppUser(await usersRepo.getById(req.appUserId)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/app/password', appAuth.requireAppUser, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
    }
    await usersRepo.setPassword(req.appUserId, newPassword);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Shopee is the only platform actually wired to Playwright automation (see
// lib/customLink.js) - other platforms in the app's picker respond
// "coming_soon" rather than pretending to work.
app.post('/app/link', appAuth.requireAppUser, async (req, res) => {
  try {
    const { platform, productUrl } = req.body;
    if (!productUrl) return res.status(400).json({ error: 'body.productUrl is required' });
    if (platform && platform !== 'shopee') {
      return res.status(501).json({ error: 'coming_soon' });
    }
    const user = await usersRepo.getById(req.appUserId);
    const tracking = await linkTracking.prepareSubId(user.zaloUserId, undefined);
    const result = await getLinkAndCommission([productUrl], tracking.finalSubIds);
    if (tracking.userId) {
      await linkTracking.recordLink(tracking.userId, tracking.subId, [productUrl], result, result.pid);
    }

    // Same estimate shown by the Zalo bot (formatProductReply in
    // zaloMessageHandler.js): pick the "Mạng xã hội" row from the commission
    // table (falling back to the first row) and split it by this user's
    // effective %, so the app never has to know the system default itself.
    let estimate = null;
    const table = (result.commission && result.commission.commissionTable) || [];
    const social = table.find((r) => (r.channel || '').includes('Mạng xã hội')) || table[0] || null;
    if (social && social.totalAmount !== null && social.totalAmount !== undefined) {
      const pct = await getEffectivePct(user);
      const { userAmount } = splitAmount(social.totalAmount, pct);
      const userPct = social.totalPct === null || social.totalPct === undefined ? null : (social.totalPct * pct) / 100;
      estimate = { userAmount, userPct };
    }

    res.json({ ...result, estimate });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/app/links', appAuth.requireAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    res.json(await linksRepo.listByUser(req.appUserId, { limit, offset }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/orders', appAuth.requireAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    res.json(await ordersRepo.listByUser(req.appUserId, { limit, offset }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const MIN_WITHDRAW_AMOUNT = 50000;

app.get('/app/wallet', appAuth.requireAppUser, async (req, res) => {
  try {
    const summary = await ordersRepo.summaryForUser(req.appUserId);
    const pendingWithdrawal = (await withdrawalsRepo.latestPendingForUser(req.appUserId)) ?? null;
    const pendingWithdrawalTotal = await withdrawalsRepo.pendingTotalForUser(req.appUserId);
    res.json({
      ...summary,
      availableAmount: Math.max(summary.unpaidAmount - pendingWithdrawalTotal, 0),
      minWithdrawAmount: MIN_WITHDRAW_AMOUNT,
      pendingWithdrawal,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "Tao yeu cau thanh toan" on the Wallet tab: queues a payout request against
// the user's unpaid (earned but not yet transferred) commission. Doesn't
// move any money itself - an admin reviews it and pays out via the existing
// /admin/orders/:id/payout flow, then marks this request processed.
app.post('/app/wallet/withdraw', appAuth.requireAppUser, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'body.amount must be a positive number' });
    }
    if (amount < MIN_WITHDRAW_AMOUNT) {
      return res.status(400).json({ error: `so tien toi thieu la ${MIN_WITHDRAW_AMOUNT}` });
    }

    const user = await usersRepo.getById(req.appUserId);
    if (!user?.bankName || !user?.bankAccountNumber || !user?.bankAccountHolder) {
      return res.status(400).json({ error: 'missing_bank_info' });
    }

    const existingPending = await withdrawalsRepo.latestPendingForUser(req.appUserId);
    if (existingPending) {
      return res.status(409).json({ error: 'a withdrawal request is already pending', request: existingPending });
    }

    const summary = await ordersRepo.summaryForUser(req.appUserId);
    const pendingWithdrawalTotal = await withdrawalsRepo.pendingTotalForUser(req.appUserId);
    const available = Math.max(summary.unpaidAmount - pendingWithdrawalTotal, 0);
    if (amount > available) {
      return res.status(400).json({ error: 'amount exceeds available balance', available });
    }

    const request = await withdrawalsRepo.create({ userId: req.appUserId, amount, method: 'bank' });
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/campaigns', appAuth.requireAppUser, async (req, res) => {
  try {
    res.json(await campaignsRepo.viewForUser(req.appUserId));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/referral', appAuth.requireAppUser, async (req, res) => {
  try {
    const referralCode = await usersRepo.ensureReferralCode(req.appUserId);
    res.json({
      referralCode,
      stats: await referralsRepo.statsForReferrer(req.appUserId),
      invited: await referralsRepo.listForReferrer(req.appUserId),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Simple shared-secret auth so this service isn't wide open to the rest of
// the internet - every route below (aside from /zalo-webhook and /app/*
// above, which authenticate their own way) requires this header.
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
    const tracking = await linkTracking.prepareSubId(zaloUserId, subIds);
    const result = await getCustomLinks(links, tracking.finalSubIds);
    if (tracking.userId) {
      await linkTracking.recordLink(tracking.userId, tracking.subId, links, result, itemId);
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
    const tracking = await linkTracking.prepareSubId(zaloUserId, subIds);
    const result = await getLinkAndCommission(links, tracking.finalSubIds);
    if (tracking.userId) {
      await linkTracking.recordLink(tracking.userId, tracking.subId, links, result, result.pid);
    }
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --- User profile: phone (for refunds) + payment info (for payouts) ---

app.post('/users/:zaloUserId/phone', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'body.phone is required' });
    const user = await usersRepo.updatePhone(req.params.zaloUserId, phone);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/users/:zaloUserId/payment', async (req, res) => {
  try {
    const user = await usersRepo.getPayment(req.params.zaloUserId);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/users/:zaloUserId/payment', async (req, res) => {
  try {
    const { bankName, accountNumber, accountHolder } = req.body;
    if (!bankName || !accountNumber || !accountHolder) {
      return res.status(400).json({ error: 'bankName, accountNumber, accountHolder are all required' });
    }
    const user = await usersRepo.updatePayment(req.params.zaloUserId, { bankName, accountNumber, accountHolder });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Admin dashboard API: JWT-protected (see lib/adminAuth.js), sits behind
// the shared x-api-key middleware above like everything else in this file -
// the future admin-web app is expected to hold the api key server-side and
// only hand the browser the short-lived JWT. ---

app.post('/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'body.password is required' });
    if (!(await adminAuth.checkAdminPassword(password))) {
      return res.status(401).json({ error: 'invalid password' });
    }
    res.json({ token: await adminAuth.issueToken() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/password', adminAuth.requireAdmin, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'body.newPassword is required and must be at least 8 characters' });
  }
  await adminAuth.setAdminPassword(newPassword);
  // Changing the password doesn't itself invalidate the JWT the caller is
  // using right now, but re-issue one anyway for a consistent response shape
  // with the other rotation endpoints below.
  res.json({ ok: true, token: await adminAuth.issueToken() });
});

// Live-editable secrets (Zalo bot token, Zalo webhook secret, admin JWT
// secret) - see lib/configStore.js for why SERVICE_API_KEY is excluded.
// Values are never returned in full, only masked, so the dashboard can show
// "is this set" / "last 4 chars" without round-tripping the real secret.
app.get('/admin/config', adminAuth.requireAdmin, async (_req, res) => {
  const out = {};
  for (const key of Object.keys(configStore.KEYS)) {
    out[key] = configStore.mask(await configStore.get(key));
  }
  res.json(out);
});

app.put('/admin/config/:key', adminAuth.requireAdmin, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
  if (!configStore.KEYS[key]) return res.status(400).json({ error: `unknown config key: ${key}` });
  if (!value || typeof value !== 'string') return res.status(400).json({ error: 'body.value is required (string)' });

  await configStore.set(key, value);

  const response = { ok: true, masked: configStore.mask(value) };
  // Rotating the JWT secret invalidates the token the caller just used to
  // authenticate this very request - hand back a fresh one so the dashboard
  // can swap it in without forcing an immediate re-login.
  if (key === 'jwtSecret') response.token = await adminAuth.issueToken();
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

app.get('/admin/settings', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json({
      commissionPct: await settingsRepo.getCommissionPct(),
      referralRewardAmount: await settingsRepo.getReferralReward(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/settings', adminAuth.requireAdmin, async (req, res) => {
  try {
    const response = {};
    if (req.body.commissionPct !== undefined) {
      const pct = Number(req.body.commissionPct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ error: 'body.commissionPct must be a number between 0 and 100' });
      }
      response.commissionPct = await settingsRepo.setCommissionPct(pct);
    }
    if (req.body.referralRewardAmount !== undefined) {
      const amount = Number(req.body.referralRewardAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ error: 'body.referralRewardAmount must be a non-negative number' });
      }
      response.referralRewardAmount = await settingsRepo.setReferralReward(amount);
    }
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/users', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json(await usersRepo.listAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/users/:id/commission-pct', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { commissionPct } = req.body;
    if (commissionPct !== null && commissionPct !== undefined) {
      const pct = Number(commissionPct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ error: 'body.commissionPct must be a number between 0 and 100, or null to clear the override' });
      }
    }
    res.json(await usersRepo.setCommissionPct(req.params.id, commissionPct));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/users/:id', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { phone, bankName, bankAccountNumber, bankAccountHolder } = req.body;
    const user = await usersRepo.updateProfileById(req.params.id, { phone, bankName, bankAccountNumber, bankAccountHolder });
    if (!user) return res.status(404).json({ error: 'user not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/users/:id/orders', adminAuth.requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    res.json(await ordersRepo.listByUser(req.params.id, { limit, offset }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Per-customer breakdown: paid vs unpaid completed orders/amounts, plus
// orders still pending Shopee's own confirmation.
app.get('/admin/customers', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json(await ordersRepo.customerSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/orders', adminAuth.requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const { payoutStatus, displayStatus } = req.query;
    const opts = { limit, offset, payoutStatus, displayStatus };
    res.json({ orders: await ordersRepo.listOrders(opts), total: await ordersRepo.countOrders(opts) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/orders/:id/payout', adminAuth.requireAdmin, async (req, res) => {
  try {
    res.json(await ordersRepo.setPayoutStatus(req.params.id, !!req.body.paid));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/stats', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json(await ordersRepo.statsSummary());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/reconcile', adminAuth.requireAdmin, async (_req, res) => {
  try {
    const result = await reconcileOrders();
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Milestone/tier campaigns ("Su kien" tab in the app) - tiers is a simple
// [{orders, reward}] array, edited as one JSON blob from the dashboard
// rather than needing a dedicated tiers UI.
app.get('/admin/campaigns', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json(await campaignsRepo.listAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/campaigns', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { title, description, startsAt, endsAt, tiers, isActive } = req.body;
    if (!title) return res.status(400).json({ error: 'body.title is required' });
    res.json(await campaignsRepo.create({ title, description, startsAt, endsAt, tiers, isActive: isActive !== false }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/campaigns/:id', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { title, description, startsAt, endsAt, tiers, isActive } = req.body;
    const updated = await campaignsRepo.update(req.params.id, { title, description, startsAt, endsAt, tiers, isActive });
    if (!updated) return res.status(404).json({ error: 'campaign not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Review queue for app-initiated withdrawal requests (Wallet tab "Tao yeu
// cau thanh toan"). Approving here doesn't move money by itself - admin still
// bank-transfers manually and marks the underlying orders paid via the
// existing /admin/orders/:id/payout flow, same as before this feature.
app.get('/admin/withdrawals', adminAuth.requireAdmin, async (req, res) => {
  try {
    res.json(await withdrawalsRepo.listAll({ status: req.query.status }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/withdrawals/:id', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected', 'paid'].includes(status)) {
      return res.status(400).json({ error: "body.status must be one of 'pending'|'approved'|'rejected'|'paid'" });
    }
    res.json(await withdrawalsRepo.setStatus(req.params.id, status));
  } catch (err) {
    res.status(500).json({ error: err.message });
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
