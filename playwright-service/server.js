require('dotenv').config();
const express = require('express');
const browserManager = require('./lib/browserManager');
const { getCustomLinks } = require('./lib/customLink');
const { getCommission } = require('./lib/commission');
const { getLinkAndCommission } = require('./lib/linkAndCommission');
const linkTracking = require('./lib/linkTracking');
const usersRepo = require('./lib/repositories/users');
const zaloBot = require('./lib/zaloBot');
const zaloMessageHandler = require('./lib/zaloMessageHandler');

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
  const expected = process.env.ZALO_WEBHOOK_SECRET;
  console.log(
    `zalo-webhook: hit, headers=${JSON.stringify(req.headers)}, secretMatch=${secret === expected}, ` +
      `secretLen=${secret ? secret.length : 'none'}, expectedLen=${expected ? expected.length : 'none'}`
  );
  if (!expected || secret !== expected) {
    console.log('zalo-webhook: rejected on secret check');
    return;
  }

  const result = req.body && req.body.result;
  console.log(`zalo-webhook: body=${JSON.stringify(req.body)}`);
  if (!result || result.event_name !== 'message.text.received') {
    console.log(`zalo-webhook: rejected on event_name check, got=${result && result.event_name}`);
    return;
  }

  const text = result.message && result.message.text;
  const chatId = result.message && result.message.chat && result.message.chat.id;
  if (!chatId) {
    console.log('zalo-webhook: rejected, missing chatId');
    return;
  }

  (async () => {
    const isNewUser = usersRepo.isNewUser(chatId);
    const user = usersRepo.getOrCreateUserByZaloId(chatId);
    console.log(`zalo-webhook: chatId=${chatId} isNewUser=${isNewUser} userRowId=${user.id}`);
    if (isNewUser) {
      await zaloBot.sendMessage(chatId, zaloMessageHandler.WELCOME_TEXT).catch((err) => {
        console.error('zalo-webhook: welcome send failed', err.message);
      });
    }

    const replyText = await zaloMessageHandler.handleIncomingMessage(text, chatId);
    await zaloBot.sendMessage(chatId, replyText);
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

app.listen(PORT, () => {
  console.log(`Shopee affiliate Playwright service listening on http://localhost:${PORT}`);
  // Pre-warm the custom-link tab pool on boot if a session is already
  // persisted on disk, so the very first request doesn't pay the cold-page
  // cost either.
  browserManager.refillCustomLinkPool();
});

process.on('SIGTERM', async () => {
  await browserManager.shutdown();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await browserManager.shutdown();
  process.exit(0);
});
