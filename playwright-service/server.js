require('dotenv').config();
const express = require('express');
const browserManager = require('./lib/browserManager');
const { getCustomLinks, getCustomLinksViaPersistentTab } = require('./lib/customLink');
const { getCommission, getCommissionViaFetch, getCommissionRequestHeaders } = require('./lib/commission');
const { getLinkAndCommission } = require('./lib/linkAndCommission');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.SERVICE_API_KEY;

// Simple shared-secret auth so this service isn't wide open - n8n sends the
// same key back on every HTTP Request node call (see n8n/shopee-affiliate-workflow.json).
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
    const { links, subIds } = req.body;
    const result = await getCustomLinks(links, subIds);
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
    const { links, subIds } = req.body;
    const result = await getLinkAndCommission(links, subIds);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// EXPERIMENTAL - latency comparison endpoints, not used by the n8n workflow.
// Safe to hit repeatedly; they don't touch the pooled/production tabs.
app.get('/debug/commission-fetch/:pid', async (req, res) => {
  try {
    const t0 = Date.now();
    const result = await getCommissionViaFetch(req.params.pid);
    res.json({ ...result, ms: Date.now() - t0 });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/debug/commission-headers/:pid', async (req, res) => {
  try {
    const result = await getCommissionRequestHeaders(req.params.pid);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/debug/custom-link-persistent', async (req, res) => {
  try {
    const { links, subIds } = req.body;
    const t0 = Date.now();
    const result = await getCustomLinksViaPersistentTab(links, subIds);
    res.json({ ...result, ms: Date.now() - t0 });
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

process.on('SIGTERM', async () => {
  await browserManager.shutdown();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await browserManager.shutdown();
  process.exit(0);
});
