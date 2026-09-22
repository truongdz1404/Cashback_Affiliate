require('dotenv').config();
const path = require('path');
const express = require('express');
const { Prisma } = require('@prisma/client');
const cron = require('node-cron');
const { randomUUID } = require('crypto');
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
const bannersRepo = require('./lib/repositories/banners');
const referralsRepo = require('./lib/repositories/referrals');
const withdrawalsRepo = require('./lib/repositories/withdrawals');
const banksRepo = require('./lib/repositories/banks');
const shoppingProductsRepo = require('./lib/repositories/shoppingProducts');
const recommendationsRepo = require('./lib/repositories/recommendations');
const searchHistoryRepo = require('./lib/repositories/searchHistory');
const shoppingProductImport = require('./lib/shoppingProductImport');
const productOfferSyncJob = require('./lib/productOfferSyncJob');
const zaloBot = require('./lib/zaloBot');
const zaloMessageHandler = require('./lib/zaloMessageHandler');
const adminAuth = require('./lib/adminAuth');
const appAuth = require('./lib/appAuth');
const oauthLogin = require('./lib/oauthLogin');
const configStore = require('./lib/configStore');
const { reconcileOrders } = require('./lib/reconciliation');
const { runHealthCheck } = require('./lib/healthCheck');
const { rateLimit } = require('./lib/simpleRateLimit');
const { getEffectivePct, estimateFromResult } = require('./lib/commissionSplit');
const { publishWithdrawalRequest } = require('./lib/queue/withdrawalQueue');
const emailOtp = require('./lib/emailOtp');
const { availableAmountForUser } = require('./lib/walletBalance');

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 4000;
const API_KEY = process.env.SERVICE_API_KEY;
// Where this service is publicly reachable - used only to build absolute
// logo URLs for /app/banks (req.protocol/req.get('host') isn't reliable
// behind the nginx reverse proxy without trust-proxy config).
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://refundmoney.tro247.online';

// Bank logos crawled by scripts/syncBanks.js - served as plain static files,
// same origin as the API so the app doesn't need a separate asset host.
app.use('/app/bank-logos', express.static(path.join(__dirname, 'public', 'bank-logos')));

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

// Facebook's "Valid OAuth Redirect URIs" only accepts https:// URIs, but the
// app itself lives at a custom URL scheme (rewally://). This static page is
// the https hop Facebook redirects to; its inline script immediately forwards
// the URL fragment (where the access_token lives - never sent to a server)
// on to the app's own custom-scheme deep link, which the OS then opens.
app.get('/app/oauth/relay', (req, res) => {
  res.type('html').send(`<!DOCTYPE html><html><body>
<script>window.location.replace('rewally://oauthredirect#' + window.location.hash.slice(1));</script>
</body></html>`);
});

// Static legal pages required by Facebook (and Google Play/App Store later)
// before an OAuth app can go Live - linked from the Facebook App Dashboard's
// "Privacy Policy URL" / "Data Deletion" fields under app settings.
const LEGAL_CONTACT_EMAIL = 'tro247.company@gmail.com';

app.get('/app/legal/privacy', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Chính sách quyền riêng tư - Rewally</title>
<style>
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; color: #2A2E35; line-height: 1.6; }
  h1 { color: #4C7EF3; font-size: 22px; }
  h2 { font-size: 17px; margin-top: 32px; }
  a { color: #4C7EF3; }
  .updated { color: #777; font-size: 13px; margin-bottom: 24px; }
</style>
</head>
<body>
<h1>Chính sách quyền riêng tư - Rewally</h1>
<p class="updated">Cập nhật lần cuối: 29/08/2026</p>

<p>Rewally ("chúng tôi") cung cấp dịch vụ hoàn tiền/tiếp thị liên kết cho các sàn thương mại điện tử (Shopee và các sàn khác trong tương lai). Chính sách này giải thích chúng tôi thu thập, sử dụng và bảo vệ thông tin của bạn như thế nào khi bạn dùng ứng dụng Rewally.</p>

<h2>1. Thông tin chúng tôi thu thập</h2>
<ul>
  <li><b>Thông tin tài khoản:</b> số điện thoại, mật khẩu (được mã hóa, không lưu dạng văn bản thuần).</li>
  <li><b>Thông tin đăng nhập qua Google/Facebook (nếu bạn chọn dùng):</b> tên hiển thị, địa chỉ email, ảnh đại diện công khai. Chúng tôi không truy cập và không lưu mật khẩu Google/Facebook của bạn.</li>
  <li><b>Thông tin thanh toán:</b> tên ngân hàng, số tài khoản ngân hàng, dùng để chi trả tiền hoàn tiền/hoa hồng cho bạn.</li>
  <li><b>Dữ liệu giao dịch:</b> link sản phẩm bạn tạo qua app, đơn hàng và hoa hồng phát sinh từ các link đó.</li>
  <li><b>Dữ liệu giới thiệu bạn bè:</b> mã giới thiệu, danh sách người bạn đã mời (nếu bạn dùng tính năng này).</li>
</ul>

<h2>2. Mục đích sử dụng</h2>
<ul>
  <li>Xác thực và bảo vệ tài khoản của bạn.</li>
  <li>Tạo link tiếp thị liên kết và tính toán hoa hồng/hoàn tiền.</li>
  <li>Xử lý thanh toán hoàn tiền/thưởng sự kiện/thưởng giới thiệu bạn bè vào tài khoản ngân hàng bạn cung cấp.</li>
  <li>Chăm sóc khách hàng và hỗ trợ khi bạn liên hệ.</li>
</ul>

<h2>3. Chia sẻ thông tin</h2>
<p>Chúng tôi không bán hoặc cho thuê thông tin cá nhân của bạn. Thông tin chỉ được chia sẻ trong các trường hợp sau:</p>
<ul>
  <li>Với Google/Facebook: chỉ ở bước xác thực đăng nhập (OAuth), theo đúng quy định của các nền tảng này.</li>
  <li>Với sàn thương mại điện tử (Shopee...): chỉ dữ liệu cần thiết để tạo/tra cứu link liên kết và đối soát hoa hồng.</li>
  <li>Khi pháp luật yêu cầu.</li>
</ul>

<h2>4. Lưu trữ và bảo mật</h2>
<p>Dữ liệu được lưu trữ trên máy chủ có kiểm soát truy cập, mật khẩu được mã hóa một chiều (hashed). Chúng tôi áp dụng các biện pháp hợp lý để bảo vệ dữ liệu khỏi truy cập trái phép.</p>

<h2>5. Quyền của bạn</h2>
<p>Bạn có quyền yêu cầu truy cập, chỉnh sửa hoặc xóa dữ liệu cá nhân của mình. Xem hướng dẫn xóa dữ liệu tại <a href="/app/legal/data-deletion">đây</a>.</p>

<h2>6. Trẻ em</h2>
<p>Dịch vụ này không hướng đến người dùng dưới 16 tuổi. Chúng tôi không cố ý thu thập dữ liệu từ trẻ em.</p>

<h2>7. Thay đổi chính sách</h2>
<p>Chúng tôi có thể cập nhật chính sách này theo thời gian. Phiên bản mới nhất luôn được đăng tại địa chỉ này.</p>

<h2>8. Liên hệ</h2>
<p>Mọi câu hỏi về quyền riêng tư, vui lòng liên hệ: <a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a></p>
</body>
</html>`);
});

app.get('/app/legal/data-deletion', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Hướng dẫn xóa dữ liệu - Rewally</title>
<style>
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px 64px; color: #2A2E35; line-height: 1.6; }
  h1 { color: #4C7EF3; font-size: 22px; }
  h2 { font-size: 17px; margin-top: 32px; }
  a { color: #4C7EF3; }
  .updated { color: #777; font-size: 13px; margin-bottom: 24px; }
  ol { padding-left: 20px; }
</style>
</head>
<body>
<h1>Hướng dẫn yêu cầu xóa dữ liệu - Rewally</h1>
<p class="updated">Cập nhật lần cuối: 29/08/2026</p>

<p>Nếu bạn muốn xóa toàn bộ dữ liệu cá nhân đã cung cấp cho Rewally (bao gồm dữ liệu liên kết qua đăng nhập Google/Facebook), vui lòng làm theo các bước sau:</p>

<h2>Cách gửi yêu cầu</h2>
<ol>
  <li>Gửi email tới <a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a> với tiêu đề: <b>"Yêu cầu xóa dữ liệu tài khoản Rewally"</b>.</li>
  <li>Trong email, vui lòng cung cấp số điện thoại đã đăng ký tài khoản, hoặc địa chỉ email bạn dùng để đăng nhập bằng Google/Facebook, để chúng tôi xác minh đúng tài khoản.</li>
</ol>

<h2>Quy trình xử lý</h2>
<p>Sau khi xác minh yêu cầu, chúng tôi sẽ xóa vĩnh viễn dữ liệu cá nhân liên quan đến tài khoản của bạn (thông tin đăng nhập, thông tin ngân hàng, lịch sử liên kết đã tạo) trong vòng <b>30 ngày làm việc</b>, ngoại trừ dữ liệu bắt buộc phải lưu giữ theo quy định pháp luật hiện hành (ví dụ chứng từ giao dịch tài chính đã phát sinh).</p>
<p>Chúng tôi sẽ gửi email xác nhận đến bạn khi việc xóa dữ liệu hoàn tất.</p>

<h2>Liên hệ</h2>
<p><a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a></p>
</body>
</html>`);
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

// email is intentionally NOT accepted here - it's a @unique, login-linkable
// field (see the account-takeover comment in lib/repositories/users.js), so
// changing it must go through the OTP-verified /app/me/email/* routes below
// rather than being writable in the same unauthenticated-of-new-value shot
// as phone/bank/name.
app.put('/app/me', appAuth.requireAppUser, async (req, res) => {
  try {
    const { phone, bankName, bankAccountNumber, bankAccountHolder, fullName } = req.body;
    const updated = await usersRepo.updateProfileById(req.appUserId, { phone, bankName, bankAccountNumber, bankAccountHolder, fullName });
    if (!updated) return res.status(404).json({ error: 'user not found' });
    res.json(usersRepo.toPublicAppUser(await usersRepo.getById(req.appUserId)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Step 1 of email change: mail a 6-digit code to the candidate address.
// Rate-limited per IP like /app/register - this is reachable by any logged-in
// app user, so it could otherwise be used to spam arbitrary inboxes.
app.post('/app/me/email/request-otp', appAuth.requireAppUser, rateLimit({ windowMs: 15 * 60 * 1000, max: 5 }), async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'body.email is invalid' });

    const existing = await usersRepo.getById(req.appUserId);
    if (existing?.email === email) return res.status(400).json({ error: 'this is already your current email' });

    await emailOtp.requestOtp(req.appUserId, email);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Step 2: verify the code and, only then, write the new email onto the user.
app.post('/app/me/email/verify-otp', appAuth.requireAppUser, rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'body.email is invalid' });
    if (!otp) return res.status(400).json({ error: 'body.otp is required' });

    await emailOtp.verifyOtp(req.appUserId, email, otp);

    try {
      await usersRepo.updateProfileById(req.appUserId, { email });
    } catch (err) {
      // email is @unique - the code was valid, but someone else grabbed this
      // address in the meantime.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return res.status(409).json({ error: 'email already in use' });
      }
      throw err;
    }

    res.json(usersRepo.toPublicAppUser(await usersRepo.getById(req.appUserId)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put('/app/password', appAuth.requireAppUser, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
    }
    if (!(await usersRepo.verifyPassword(req.appUserId, currentPassword || ''))) {
      return res.status(400).json({ error: 'currentPassword is incorrect' });
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
    const estimate = estimateFromResult(result, await getEffectivePct(user));

    if (tracking.userId) {
      await linkTracking.recordLink(tracking.userId, tracking.subId, [productUrl], result, result.pid, estimate, result.meta);
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
// How long the HTTP request waits for the worker to finish processing before
// falling back to 202/processing - the worker's own work is just a couple of
// DB round trips so this comfortably covers normal cases while still
// bounding the request lifetime if RabbitMQ/the worker is briefly down.
const WITHDRAW_POLL_TIMEOUT_MS = 6000;
const WITHDRAW_POLL_INTERVAL_MS = 200;

app.get('/app/wallet', appAuth.requireAppUser, async (req, res) => {
  try {
    const { summary, available } = await availableAmountForUser(req.appUserId);
    const pendingWithdrawal = (await withdrawalsRepo.latestPendingForUser(req.appUserId)) ?? null;
    res.json({
      ...summary,
      availableAmount: available,
      minWithdrawAmount: MIN_WITHDRAW_AMOUNT,
      pendingWithdrawal,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// "Tao yeu cau thanh toan" on the Wallet tab. The actual accept/reject
// decision (balance re-check under a Postgres advisory lock) happens in
// worker/withdrawalWorker.js, not here - this route only does the cheap
// up-front validation, publishes the request to RabbitMQ, then polls the DB
// briefly by clientRequestId so the app still gets an immediate result in
// the common case. Doesn't move any money itself - an admin reviews accepted
// requests and pays out manually, then marks the request 'paid'.
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

    const clientRequestId = randomUUID();
    await publishWithdrawalRequest({ clientRequestId, userId: req.appUserId, amount, method: 'bank' });

    const deadline = Date.now() + WITHDRAW_POLL_TIMEOUT_MS;
    let request = null;
    while (Date.now() < deadline) {
      request = await withdrawalsRepo.findByClientRequestId(clientRequestId);
      if (request) break;
      await sleep(WITHDRAW_POLL_INTERVAL_MS);
    }

    if (!request) {
      return res.status(202).json({ clientRequestId, status: 'processing' });
    }
    if (request.status === 'rejected') {
      return res.status(400).json({ error: 'amount exceeds available balance or another request is already open', request });
    }
    res.json(request);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/wallet/withdrawals', appAuth.requireAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    res.json(await withdrawalsRepo.listForUser(req.appUserId, { limit, offset }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/banks', appAuth.requireAppUser, async (req, res) => {
  try {
    const banks = await banksRepo.listAll();
    res.json(banks.map((bank) => banksRepo.toPublicBank(bank, PUBLIC_BASE_URL)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/banners', appAuth.requireAppUser, async (_req, res) => {
  try {
    res.json(await bannersRepo.listActive());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/campaigns', appAuth.requireAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const offset = Number(req.query.offset) || 0;
    res.json(await campaignsRepo.viewForUser(req.appUserId, { limit, offset }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/shopping-products', appAuth.requireAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const minPrice = req.query.minPrice !== undefined ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : undefined;
    const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;

    const user = await usersRepo.getById(req.appUserId);
    const pct = await getEffectivePct(user);

    // minCommissionPct/maxCommissionPct/minCommissionAmount/maxCommissionAmount
    // are USER-FACING (what this user actually receives), same scale as the
    // userCommissionRateValue/userCommissionValue fields returned below -
    // convert to Shopee's raw scale before querying, since that's what's
    // stored (see schema.prisma comment on ShoppingProduct.commissionRateValue).
    const toRaw = (userFacing) => (userFacing != null && pct > 0 ? (userFacing * 100) / pct : undefined);
    const minCommissionRateValue = toRaw(req.query.minCommissionPct !== undefined ? Number(req.query.minCommissionPct) : undefined);
    const maxCommissionRateValue = toRaw(req.query.maxCommissionPct !== undefined ? Number(req.query.maxCommissionPct) : undefined);
    const minCommissionValue = toRaw(req.query.minCommissionAmount !== undefined ? Number(req.query.minCommissionAmount) : undefined);
    const maxCommissionValue = toRaw(req.query.maxCommissionAmount !== undefined ? Number(req.query.maxCommissionAmount) : undefined);

    // "Filter active" = the user touched the filter sheet (price/commission
    // bounds) or explicitly picked a sort other than the default "newest" -
    // in either case the original DB-pushdown listing must stay untouched.
    // Otherwise (plain browse, or a search with no filter) the list is
    // personalized: matches float to the top, non-matches just sink instead
    // of disappearing. See lib/repositories/recommendations.js.
    const hasFilter =
      minPrice != null ||
      maxPrice != null ||
      minCommissionRateValue != null ||
      maxCommissionRateValue != null ||
      minCommissionValue != null ||
      maxCommissionValue != null ||
      (sort != null && sort !== 'newest');

    const products = hasFilter
      ? await shoppingProductsRepo.list({
          limit,
          offset,
          search,
          minPrice,
          maxPrice,
          minCommissionRateValue,
          maxCommissionRateValue,
          minCommissionValue,
          maxCommissionValue,
          sort,
        })
      : await recommendationsRepo.rankProductsForUser(req.appUserId, { search, limit, offset });

    if (search) {
      // Fire-and-forget: feeds the "session-based" signal in buildAffinity()
      // (lib/repositories/recommendations.js), never blocks/fails the response.
      searchHistoryRepo.record(req.appUserId, search).catch(() => {});
    }

    res.json(products.map((p) => ({
      ...p,
      userCommissionRateValue: p.commissionRateValue != null ? (p.commissionRateValue * pct) / 100 : null,
      userCommissionValue: p.commissionValue != null ? (p.commissionValue * pct) / 100 : null,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "Gợi ý cho bạn" on the Home tab - see lib/repositories/recommendations.js
// for how this is scored off the user's "Tạo link" history.
app.get('/app/recommendations', appAuth.requireAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 30);
    const user = await usersRepo.getById(req.appUserId);
    const pct = await getEffectivePct(user);
    const { items } = await recommendationsRepo.recommendForUser(req.appUserId, { limit });
    res.json(items.map((p) => ({
      ...p,
      userCommissionRateValue: p.commissionRateValue != null ? (p.commissionRateValue * pct) / 100 : null,
      userCommissionValue: p.commissionValue != null ? (p.commissionValue * pct) / 100 : null,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/referral', appAuth.requireAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const referralCode = await usersRepo.ensureReferralCode(req.appUserId);
    res.json({
      referralCode,
      stats: await referralsRepo.statsForReferrer(req.appUserId),
      invited: await referralsRepo.listForReferrer(req.appUserId, { limit, offset }),
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

// Tighter than the app-user login limiter above - there's only ever one
// admin password, so a brute-force attempt against it is far more
// concentrated (and far more dangerous, since it unlocks every money-moving
// admin route) than the same rate against millions of possible phone numbers.
app.post('/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), async (req, res) => {
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
      productOfferMaxPages: await settingsRepo.getProductOfferMaxPages(),
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
    if (req.body.productOfferMaxPages !== undefined) {
      const pages = Number(req.body.productOfferMaxPages);
      if (!Number.isInteger(pages) || pages < 1 || pages > 100) {
        return res.status(400).json({ error: 'body.productOfferMaxPages must be an integer between 1 and 100' });
      }
      response.productOfferMaxPages = await settingsRepo.setProductOfferMaxPages(pages);
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

// Referral/campaign rewards are paid out manually by admin the same way
// orders are (bank transfer outside the app, then marked paid here) - see
// lib/repositories/referrals.js#markPaid / campaigns.js#markRewardPaid.
app.put('/admin/referrals/:id/payout', adminAuth.requireAdmin, async (req, res) => {
  try {
    res.json(await referralsRepo.markPaid(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/campaign-rewards/:id/payout', adminAuth.requireAdmin, async (req, res) => {
  try {
    res.json(await campaignsRepo.markRewardPaid(req.params.id));
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

// Manual trigger for the daily product-offer scrape - see the cron entry
// below for the scheduled run. Useful for testing without waiting for the
// next morning.
//
// Runs in the background (202 + poll via GET below) rather than blocking the
// request for the whole crawl - a multi-page crawl routinely runs past
// Cloudflare's own ~100s upstream timeout, which returns its own HTML 524
// error page well before this finishes even though the crawl itself
// completes fine server-side; that mismatch was confusing this endpoint's
// callers into thinking the sync had failed when it hadn't.
app.post('/admin/product-offer-sync', adminAuth.requireAdmin, async (req, res) => {
  try {
    const maxPages = req.body?.maxPages ? Number(req.body.maxPages) : await settingsRepo.getProductOfferMaxPages();
    const { tabName, startPage, searchText, sortLabel } = req.body || {};
    res.status(202).json(
      productOfferSyncJob.start({
        maxPages,
        tabName: tabName || undefined,
        startPage: startPage ? Number(startPage) : undefined,
        searchText: searchText || undefined,
        sortLabel: sortLabel || undefined,
      })
    );
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/admin/product-offer-sync', adminAuth.requireAdmin, (_req, res) => {
  res.json(productOfferSyncJob.getStatus());
});

app.get('/admin/banners', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json(await bannersRepo.listAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/admin/banners', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { imageUrl, linkUrl, sortOrder, isActive } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'body.imageUrl is required' });
    res.json(await bannersRepo.create({ imageUrl, linkUrl, sortOrder, isActive }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/banners/:id', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { imageUrl, linkUrl, sortOrder, isActive } = req.body;
    const updated = await bannersRepo.update(req.params.id, { imageUrl, linkUrl, sortOrder, isActive });
    if (!updated) return res.status(404).json({ error: 'banner not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/banners/:id', adminAuth.requireAdmin, async (req, res) => {
  try {
    const removed = await bannersRepo.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'banner not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "Mua sắm" tab's product catalog. Normally kept fresh by the daily
// product-offer-sync scrape (see /admin/product-offer-sync below), but an
// admin can also drop in the same list file by hand here - same
// upsert-by-productId semantics either way, so a manual import never
// duplicates rows the scraper already collected.
app.get('/admin/shopping-products', adminAuth.requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const [items, total] = await Promise.all([
      shoppingProductsRepo.list({ limit, offset, search, sort: 'newest' }),
      shoppingProductsRepo.count({ search }),
    ]);
    res.json({ items, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/admin/shopping-products/:id', adminAuth.requireAdmin, async (req, res) => {
  try {
    const removed = await shoppingProductsRepo.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'product not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Body is the raw file bytes (not JSON) - the admin-web proxy route reads
// the uploaded file and forwards it verbatim, filename carried in a header
// since multipart parsing isn't otherwise needed anywhere in this service.
app.post(
  '/admin/shopping-products/import',
  adminAuth.requireAdmin,
  express.raw({ type: '*/*', limit: '25mb' }),
  async (req, res) => {
    try {
      const fileName = decodeURIComponent(req.get('x-file-name') || 'upload.csv');
      const result = await shoppingProductImport.importFile(req.body, fileName);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Milestone/tier campaigns ("Su kien" tab in the app) - tiers is a simple
// [{amount, reward}] array ("pay out `reward` once this user's paid
// cashback in the campaign window reaches `amount`"), edited as one JSON
// blob from the dashboard rather than needing a dedicated tiers UI.
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

// Calculation helper for admins defining tiers: turns "every 100k paid,
// +10k reward, 5 times" into the actual [{amount, reward}] array, so they
// don't have to hand-multiply the JSON blob above. Doesn't touch the DB -
// admins review/tweak the preview then pass it as `tiers` to POST/PUT
// /admin/campaigns as usual.
app.post('/admin/campaigns/tier-calculator', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { stepAmount, rewardPerStep, steps } = req.body;
    res.json({ tiers: campaignsRepo.buildStepTiers({ stepAmount, rewardPerStep, steps }) });
  } catch (err) {
    res.status(400).json({ error: err.message });
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

  // One-time seed: only hits VietQR if the banks table is still empty (fresh
  // DB / first deploy after this migration), so normal restarts don't
  // re-download 65 logos every time.
  banksRepo
    .count()
    .then((count) => (count === 0 ? require('./scripts/syncBanks').syncBanks() : null))
    .then((synced) => synced && console.log(`banks: seeded ${synced} banks from VietQR`))
    .catch((err) => console.error('banks: initial sync failed', err.message));
});

// Order reconciliation, every 6 hours - also triggerable on demand via
// POST /admin/reconcile.
cron.schedule('0 */6 * * *', () => {
  reconcileOrders()
    .then((result) => console.log(`cron reconcile: ${JSON.stringify(result)}`))
    .catch((err) => console.error('cron reconcile failed', err.message));
});

// Health check: every 30 minutes - alerts via email if any service is down
cron.schedule('*/30 * * * *', () => {
  runHealthCheck().catch((err) => console.error('health-check cron error', err.message));
});

// Daily product-offer scrape for the "Mua sắm" tab, every morning at 6:00
// (server time). See lib/productOfferScraper.js for the page-count/pacing
// caution - also triggerable on demand via POST /admin/product-offer-sync.
cron.schedule('0 6 * * *', async () => {
  try {
    const maxPages = await settingsRepo.getProductOfferMaxPages();
    productOfferSyncJob.start({ maxPages });
  } catch (err) {
    console.error('cron product-offer-sync failed', err.message);
  }
});

process.on('SIGTERM', async () => {
  await browserManager.shutdown();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await browserManager.shutdown();
  process.exit(0);
});
