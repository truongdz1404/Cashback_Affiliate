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
const appConfigRepo = require('./lib/repositories/appConfig');
const campaignsRepo = require('./lib/repositories/campaigns');
const bannersRepo = require('./lib/repositories/banners');
const referralsRepo = require('./lib/repositories/referrals');
const referralCommissionsRepo = require('./lib/repositories/referralCommissions');
const withdrawalsRepo = require('./lib/repositories/withdrawals');
const banksRepo = require('./lib/repositories/banks');
const shoppingProductsRepo = require('./lib/repositories/shoppingProducts');
const recommendationsRepo = require('./lib/repositories/recommendations');
const searchHistoryRepo = require('./lib/repositories/searchHistory');
const shoppingProductImport = require('./lib/shoppingProductImport');
const productOfferSyncJob = require('./lib/productOfferSyncJob');
const shopsRepo = require('./lib/repositories/shops');
const shopNameResolutionsRepo = require('./lib/repositories/shopNameResolutions');
const shopResolution = require('./lib/shopResolution');
const shopNameResolveJob = require('./lib/shopNameResolveJob');
const shopProductSyncJob = require('./lib/shopProductSyncJob');
const shopeeAffiliateApi = require('./lib/shopeeAffiliateApi');
const browserJobLock = require('./lib/browserJobLock');
const continuousJobs = require('./lib/continuousJobs');
const jobRunsRepo = require('./lib/repositories/jobRuns');
const { withJobRun } = require('./lib/jobRunner');
const { buildAffiliateLink } = require('./lib/affiliateLink');
const { backfillMissingCategories } = require('./lib/categoryEnrichment');
const { backfillMissingShopIds } = require('./lib/shopLinkBackfill');
const { enrichShopDetails } = require('./lib/shopDetailEnrichment');
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

/**
 * Uniform HTTP mapping for the three failure modes of the Shopee JSON API, so
 * admin-web can show the right banner without string-matching messages.
 * 503 = Shopee is refusing us for now (retry later, automatically);
 * 409 = a human must paste a fresh cookie - nothing retries its way out of it.
 */
function sendShopeeApiError(res, err) {
  if (err instanceof shopeeAffiliateApi.BlockedError) {
    return res.status(503).json({ error: 'shopee_blocked', message: err.message, retryAfterMs: err.retryAfterMs ?? null });
  }
  if (err instanceof shopeeAffiliateApi.SessionExpiredError) {
    return res.status(409).json({ error: 'session_expired', message: err.message, hint: 'POST /admin/session-cookie với cookie mới' });
  }
  return res.status(502).json({ error: err.message });
}

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
    let user = await usersRepo.verifyLogin(phone, password);
    if (!user) return res.status(401).json({ error: 'invalid phone or password' });
    user = await adminAuth.syncRoleFromAllowlist(user);
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

// Remote config for the mobile app. Two routes on purpose:
//
//   GET /app/config/version -> { version }   (tiny, called on every launch)
//   GET /app/config         -> { version, updatedAt, config }
//
// The app keeps the last document in AsyncStorage together with its version.
// On launch (and when coming back to the foreground) it asks for the version
// only; if that matches the cached one it stops there and spends no bandwidth.
// Everything else is public marketing/config data, so no auth is required -
// the login screen and the force-update gate both need it before a user
// exists.
app.get('/app/config/version', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ version: await appConfigRepo.getVersion() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/config', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await appConfigRepo.getPayload());
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

    let user = await usersRepo.findOrCreateOAuthUser({
      provider,
      providerId: profile.providerId,
      email: profile.email,
      name: profile.name,
    });
    user = await adminAuth.syncRoleFromAllowlist(user);
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
    let user = await usersRepo.getById(req.appUserId);
    if (!user) return res.status(404).json({ error: 'user not found' });
    // Also here, not only at sign-in: an operator already signed in when
    // their address is added to ADMIN_EMAILS gets the role on the next page
    // load instead of having to log out and back in.
    user = await adminAuth.syncRoleFromAllowlist(user);
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

    // Fire-and-forget: the commission lookup above already paid for this
    // product's meta, so close the loop into the Shopping-tab catalog for
    // free instead of waiting on the next scrape/backfill. Never blocks the
    // response - a failure here shouldn't fail the user's "Tạo link" action.
    if (result.pid && result.meta) {
      shoppingProductsRepo
        .ensureExists(result.pid, result.meta, result.commission?.commissionTable)
        .catch((err) => console.error('[shopping-product] ensureExists from /app/link failed:', err.message));
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

// Configurable in the admin dashboard (settings key `min_withdraw_amount`);
// 50000 is only the fallback when the row has never been written.
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
    const minWithdrawAmount = await settingsRepo.getMinWithdrawAmount();
    res.json({
      ...summary,
      availableAmount: available,
      minWithdrawAmount,
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
    const minWithdrawAmount = await settingsRepo.getMinWithdrawAmount();
    if (amount < minWithdrawAmount) {
      return res.status(400).json({ error: `so tien toi thieu la ${minWithdrawAmount}` });
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

// Banners/campaigns/shopping-products use optionalAppUser instead of
// requireAppUser: the public website (admin-web) has to show real content to
// logged-out visitors, otherwise its home page can only ever be a static
// brochure. A token, when present, still unlocks the personalized behaviour
// below.
app.get('/app/banners', appAuth.optionalAppUser, async (_req, res) => {
  try {
    res.json(await bannersRepo.listActive());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/campaigns', appAuth.optionalAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 100);
    const offset = Number(req.query.offset) || 0;
    // viewForUser() joins per-user reward/progress rows, which need a real
    // userId - anonymous visitors get the same campaigns with empty progress.
    res.json(req.appUserId
      ? await campaignsRepo.viewForUser(req.appUserId, { limit, offset })
      : await campaignsRepo.viewForAnonymous({ limit, offset }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reads `shopId` from either the path (/app/shops/:shopId/products) or the
// query string (/app/shopping-products?shopId=), so both URLs go through the
// same handler. Blank or whitespace-only means "no shop filter", never "a shop
// whose id is the empty string".
function readShopId(req) {
  const raw = req.params?.shopId ?? req.query?.shopId;
  if (typeof raw !== 'string') return undefined;
  return raw.trim() || undefined;
}

// One handler, registered at two URLs (see below). Deliberately not two
// handlers: this is where the user's cashback split is applied, and a second
// near-copy would be the obvious place for a future getEffectivePct change to
// land in one and not the other - which is a money bug, not a cosmetic one.
async function listShoppingProductsHandler(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const shopId = readShopId(req);
    const minPrice = req.query.minPrice !== undefined ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : undefined;
    const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
    const category = typeof req.query.category === 'string' && req.query.category ? req.query.category : undefined;
    const parseBool = (v) => (v === undefined ? undefined : v === 'true' || v === '1');
    const isBestSeller = parseBool(req.query.bestSeller);
    const isXtraCommission = parseBool(req.query.xtra);

    // getEffectivePct(null) falls back to the global commission_pct setting,
    // so anonymous visitors see the default cashback split.
    const user = req.appUserId ? await usersRepo.getById(req.appUserId) : null;
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
    // Anonymous visitors are forced down this path too: personalized ranking
    // needs a userId to score against.
    //
    // `shopId` MUST be in this list. rankProductsForUser builds its own `where`
    // from `search` alone (lib/repositories/recommendations.js), so without it
    // a logged-in user opening a shop page would be served the entire catalog
    // under that shop's name - a silent, plausible-looking wrong answer.
    const hasFilter =
      req.appUserId == null ||
      shopId != null ||
      minPrice != null ||
      maxPrice != null ||
      minCommissionRateValue != null ||
      maxCommissionRateValue != null ||
      minCommissionValue != null ||
      maxCommissionValue != null ||
      category != null ||
      isBestSeller != null ||
      isXtraCommission != null ||
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
          category,
          isBestSeller,
          isXtraCommission,
          shopId,
          sort,
        })
      : await recommendationsRepo.rankProductsForUser(req.appUserId, { search, limit, offset });

    if (search && req.appUserId) {
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
}

app.get('/app/shopping-products', appAuth.optionalAppUser, listShoppingProductsHandler);
// A shop's products are the same listing with one more filter, so it is the
// same handler at a second URL rather than a parallel endpoint. Clients that
// already know the shop get the tidier path; the query-string form keeps the
// app's existing useShoppingProducts hook working with a single extra param.
app.get('/app/shops/:shopId/products', appAuth.optionalAppUser, listShoppingProductsHandler);

// The listing route above returns a bare array with no total, which is fine
// for the app's infinite scroll but not for the website's "N sản phẩm" /
// numbered pagination. Same filter params, count only.
async function countShoppingProductsHandler(req, res) {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const minPrice = req.query.minPrice !== undefined ? Number(req.query.minPrice) : undefined;
    const maxPrice = req.query.maxPrice !== undefined ? Number(req.query.maxPrice) : undefined;
    const category = typeof req.query.category === 'string' && req.query.category ? req.query.category : undefined;
    const shopId = readShopId(req);
    const parseBool = (v) => (v === undefined ? undefined : v === 'true' || v === '1');

    const user = req.appUserId ? await usersRepo.getById(req.appUserId) : null;
    const pct = await getEffectivePct(user);
    const toRaw = (userFacing) => (userFacing != null && pct > 0 ? (userFacing * 100) / pct : undefined);

    res.json({
      total: await shoppingProductsRepo.count({
        search,
        minPrice,
        maxPrice,
        category,
        shopId,
        isBestSeller: parseBool(req.query.bestSeller),
        isXtraCommission: parseBool(req.query.xtra),
        minCommissionRateValue: toRaw(req.query.minCommissionPct !== undefined ? Number(req.query.minCommissionPct) : undefined),
        maxCommissionRateValue: toRaw(req.query.maxCommissionPct !== undefined ? Number(req.query.maxCommissionPct) : undefined),
        minCommissionValue: toRaw(req.query.minCommissionAmount !== undefined ? Number(req.query.minCommissionAmount) : undefined),
        maxCommissionValue: toRaw(req.query.maxCommissionAmount !== undefined ? Number(req.query.maxCommissionAmount) : undefined),
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.get('/app/shopping-products/count', appAuth.optionalAppUser, countShoppingProductsHandler);
app.get('/app/shops/:shopId/products/count', appAuth.optionalAppUser, countShoppingProductsHandler);

// ─── Shop: các route cho app ────────────────────────────────────────────────
// Everything below serves `visibleOnly`: isActive && status === 'linked' &&
// productCount > 0 (lib/repositories/shops.js). A shop that only turned up as
// fuzzy by-catch while resolving some product's shop name has no products to
// show, so it must never reach a user - see the VISIBLE_WHERE comment there.

// Bare array + limit capped at 100, same house shape as /app/shopping-products,
// so the app's infinite-query helpers work unchanged.
app.get('/app/shops', appAuth.optionalAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    res.json(shopsRepo.toAppShops(await shopsRepo.list({
      limit,
      offset,
      sort: typeof req.query.sort === 'string' ? req.query.sort : undefined,
      search: typeof req.query.search === 'string' && req.query.search ? req.query.search : undefined,
      featuredOnly: req.query.featured === '1' || req.query.featured === 'true' ? true : undefined,
      visibleOnly: true,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Registered BEFORE /app/shops/:shopId - otherwise the parameterised route
// swallows "count" and answers 404 for a shop that does not exist.
app.get('/app/shops/count', appAuth.optionalAppUser, async (req, res) => {
  try {
    res.json({
      total: await shopsRepo.count({
        search: typeof req.query.search === 'string' && req.query.search ? req.query.search : undefined,
        featuredOnly: req.query.featured === '1' || req.query.featured === 'true' ? true : undefined,
        visibleOnly: true,
      }),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The Home tab's "Shop nổi bật" rail. Curated by an admin (isFeatured), so an
// empty array is a legitimate answer on a fresh install and the rail must
// simply not render rather than fall back to an arbitrary pick.
app.get('/app/shops/featured', appAuth.optionalAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    res.json(shopsRepo.toAppShops(await shopsRepo.listFeatured({ limit })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// The single shop card the Shopping tab puts above its product grid when what
// someone typed clearly names a shop. This is the one place fuzzy name matching
// is allowed (lib/repositories/shops.js#scoreShopAgainstQuery); an empty array
// is the right answer for the many searches that name a product, not a shop.
app.get('/app/shops/search', appAuth.optionalAppUser, async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : '';
    const limit = Math.min(Number(req.query.limit) || 1, 5);
    res.json(shopsRepo.toAppShops(await shopsRepo.searchRanked({ search, limit })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/app/shops/:shopId', appAuth.optionalAppUser, async (req, res) => {
  try {
    const shop = await shopsRepo.getByShopId(req.params.shopId, { visibleOnly: true });
    if (!shop) return res.status(404).json({ error: 'not_found' });
    res.json(shopsRepo.toAppShop(shop));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Real Shopee categories present in the catalog right now, most-stocked
// first. The `category` column is backfilled gradually, so this can be a
// short list or empty - clients must render nothing rather than invent a
// taxonomy (the mobile app deliberately has no category browser at all).
app.get('/app/shopping-categories', appAuth.optionalAppUser, async (req, res) => {
  try {
    const minCount = Math.max(Number(req.query.minCount) || 1, 1);
    res.json(await shoppingProductsRepo.listCategories({ minCount }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// A ShoppingProduct's own offerUrl/productUrl is scraped ONCE per day and is
// identical for every app user (see lib/productOfferScraper.js) - unlike the
// "Tạo link" flow, it carries no per-user subId, so a resulting Shopee order
// can never be matched back to a userId in reconciliation.js (order.subId
// only ever resolves through the Link table). This route mints a real
// per-user tracked link on tap, the same way POST /app/link does, so the app
// can redirect through THAT instead of the static scraped url.
//
// Repeat taps on the same product reuse a link generated in the last
// SHOPPING_LINK_REUSE_WINDOW_MS instead of hitting Shopee's custom_link page
// again - re-browsing/re-opening a product shouldn't multiply real Playwright
// calls, since link generation shares a small page pool with /app/link
// (CUSTOM_LINK_POOL_SIZE in lib/browserManager.js) and Shopee's own
// anti-fraud flagging cares about automated-looking call volume, not just
// correctness.
const SHOPPING_LINK_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;

app.post('/app/shopping-products/:id/open', appAuth.requireAppUser, async (req, res) => {
  try {
    const product = await shoppingProductsRepo.getById(req.params.id);
    if (!product) return res.status(404).json({ error: 'not_found' });
    if (!product.productUrl) return res.status(422).json({ error: 'product has no source url' });

    const user = await usersRepo.getById(req.appUserId);
    const pct = await getEffectivePct(user);
    const estimate = product.commissionValue != null
      ? {
          userAmount: (product.commissionValue * pct) / 100,
          userPct: product.commissionRateValue != null ? (product.commissionRateValue * pct) / 100 : null,
        }
      : null;

    const reused = await linksRepo.findRecentByUserAndItem(req.appUserId, product.productId, SHOPPING_LINK_REUSE_WINDOW_MS);
    if (reused && reused.affiliateUrl) {
      return res.json({ affiliateUrl: reused.affiliateUrl, estimate, reused: true });
    }

    const tracking = await linkTracking.prepareSubId(user.zaloUserId, undefined);
    const result = await getCustomLinks([product.productUrl], tracking.finalSubIds);
    const first = (result.results || [])[0] || null;
    const affiliateUrl = first ? first.shortLink || first.longLink : null;

    if (tracking.userId && affiliateUrl) {
      await linkTracking.recordLink(tracking.userId, tracking.subId, [product.productUrl], result, product.productId, estimate, {
        itemName: product.name,
        catId: null,
        catName: product.category,
        shopName: product.shopName,
        priceValue: product.priceValue,
        imageUrl: product.imageUrl,
      });
    }

    if (!affiliateUrl) return res.status(502).json({ error: 'could not generate affiliate link' });
    res.json({ affiliateUrl, estimate, reused: false });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// "Gợi ý cho bạn" on the Home tab - see lib/repositories/recommendations.js
// for how this is scored off the user's "Tạo link" history.
app.get('/app/recommendations', appAuth.optionalAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 30);
    const user = req.appUserId ? await usersRepo.getById(req.appUserId) : null;
    const pct = await getEffectivePct(user);
    // Nothing to personalize against for a logged-out visitor - the website
    // shows the highest-cashback products instead, under a neutral heading.
    const items = req.appUserId
      ? (await recommendationsRepo.recommendForUser(req.appUserId, { limit })).items
      : await shoppingProductsRepo.list({ limit, sort: 'commission_desc' });
    res.json(items.map((p) => ({
      ...p,
      userCommissionRateValue: p.commissionRateValue != null ? (p.commissionRateValue * pct) / 100 : null,
      userCommissionValue: p.commissionValue != null ? (p.commissionValue * pct) / 100 : null,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Referral programme: `program` is what the app/web quote to the user (the
// % of every invitee order they earn, for how long, plus any optional fixed
// first-order bonus); `stats` merge the legacy per-referral bonus with the
// per-order commissions so "Tổng thưởng" is one number; each invitee row
// carries its own commission total; `commissions` is the recent per-order
// history.
app.get('/app/referral', appAuth.requireAppUser, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;
    const [referralCode, commissionPct, commissionMonths, firstOrderBonus, bonusStats, commissionStats, invited] =
      await Promise.all([
        usersRepo.ensureReferralCode(req.appUserId),
        settingsRepo.getReferralCommissionPct(),
        settingsRepo.getReferralCommissionMonths(),
        settingsRepo.getReferralReward(),
        referralsRepo.statsForReferrer(req.appUserId),
        referralCommissionsRepo.statsForReferrer(req.appUserId),
        referralsRepo.listForReferrer(req.appUserId, { limit, offset }),
      ]);
    const totals = await referralCommissionsRepo.totalsByReferral(invited.map((r) => r.id));
    const commissions = offset === 0 ? await referralCommissionsRepo.listForReferrer(req.appUserId, { limit: 20 }) : [];
    res.json({
      referralCode,
      program: { commissionPct, commissionMonths, firstOrderBonus },
      stats: {
        totalInvited: bonusStats.totalInvited,
        qualified: bonusStats.qualified,
        bonusTotal: bonusStats.totalReward,
        commissionTotal: commissionStats.commissionTotal,
        commissionUnpaid: commissionStats.commissionUnpaid,
        commissionPaid: commissionStats.commissionPaid,
        orderCount: commissionStats.orderCount,
        totalReward: bonusStats.totalReward + commissionStats.commissionTotal,
      },
      invited: invited.map((r) => {
        const t = totals.get(r.id) || { commissionTotal: 0, orderCount: 0 };
        return { ...r, commissionTotal: t.commissionTotal, orderCount: t.orderCount };
      }),
      commissions,
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

// --- Admin dashboard API: role-protected (see lib/adminAuth.js), sits
// behind the shared x-api-key middleware above like everything else in this
// file. There is no admin login route: an admin signs in through the normal
// /app/login* routes and the resulting app_user token is accepted here as
// long as that account's users.role is "admin". admin-web holds the api key
// server-side and forwards the user's httpOnly cookie token. ---

// Grant or revoke the dashboard for one account. Guarded so an admin can't
// lock everyone out: you can't demote yourself, and the last remaining admin
// can't be demoted at all (use ADMIN_EMAILS / scripts/set-role.js to recover).
app.put('/admin/users/:id/role', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!usersRepo.ROLES.includes(role)) {
      return res.status(400).json({ error: `body.role must be one of: ${usersRepo.ROLES.join(', ')}` });
    }
    const targetId = Number(req.params.id);
    if (role !== 'admin') {
      if (targetId === req.adminUser.id) {
        return res.status(400).json({ error: 'you cannot remove your own admin role' });
      }
      const target = await usersRepo.getById(targetId);
      if (target && target.role === 'admin' && (await usersRepo.countAdmins()) <= 1) {
        return res.status(400).json({ error: 'cannot demote the last remaining admin' });
      }
    }
    const updated = await usersRepo.setRole(targetId, role);
    if (!updated) return res.status(404).json({ error: 'user not found' });
    res.json(usersRepo.toPublicAppUser(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  if (key === 'jwtSecret') response.token = await appAuth.issueAppToken(req.adminUser.id);
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

// Shopee JSON API (lib/shopeeAffiliateApi.js) - the cookie-only endpoints from
// docs/shopee-affiliate-api-spec.txt. Read-only diagnostics for now; the jobs
// that consume them land in a later change.
app.get('/admin/shopee-api/health', adminAuth.requireAdmin, async (req, res) => {
  try {
    res.json(await shopeeAffiliateApi.getApiHealth({ probe: req.query.probe === '1' }));
  } catch (err) {
    sendShopeeApiError(res, err);
  }
});

app.post('/admin/shopee-api/reset-breaker', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json(await shopeeAffiliateApi.resetBreaker());
  } catch (err) {
    sendShopeeApiError(res, err);
  }
});

/**
 * One-shot end-to-end check of everything this API client is responsible for,
 * so the answer to "is the Shopee side healthy?" is one request instead of a
 * shell on the VPS. Three things it proves, in order of how badly they'd hurt:
 *  1. affiliate_id comes back from the live account, not from a hardcoded
 *     constant (spec §1.3) - a wrong id sends every commission elsewhere;
 *  2. keyword search returns real shops;
 *  3. the link we build ourselves is byte-identical to Shopee's own long_link
 *     (spec §3) - the whole reason we can skip the blocked GraphQL endpoint.
 */
app.get('/admin/shopee-api/ping', adminAuth.requireAdmin, async (req, res) => {
  try {
    const keyword = (req.query.keyword || 'vinamilk').toString();
    const affiliateId = await shopeeAffiliateApi.getAffiliateId();
    const shops = await shopeeAffiliateApi.searchShopsByKeyword(keyword, { pageLimit: 5 });

    const linkChecks = shops
      .filter((s) => s.long_link)
      .slice(0, 3)
      .map((s) => {
        const built = buildAffiliateLink({ target: s.shop_link, affiliateId });
        return { shopId: s.shop_id, shopName: s.shop_name, built, longLink: s.long_link, match: built === s.long_link };
      });

    res.json({
      affiliateId,
      affiliateIdSource: process.env.SHOPEE_AFFILIATE_ID ? 'env' : 'api/settings',
      keyword,
      shopCount: shops.length,
      shops: shops.map((s) => ({ shopId: s.shop_id, shopName: s.shop_name, commissionRate: s.commission_rate })),
      linkChecks,
      allLinksMatch: linkChecks.length > 0 && linkChecks.every((c) => c.match),
      health: await shopeeAffiliateApi.getApiHealth(),
    });
  } catch (err) {
    sendShopeeApiError(res, err);
  }
});

// What the shared Playwright context is doing right now. `null` means idle.
app.get('/admin/browser-lock', adminAuth.requireAdmin, (_req, res) => {
  res.json({ busy: browserJobLock.isBusy(), current: browserJobLock.getCurrent() });
});

// What the continuous loops are doing: which mode is live, what each loop ran
// last, and when it wakes next. `standby` means cron is driving instead.
app.get('/admin/job-loops', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json(await continuousJobs.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/admin/settings', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json({
      commissionPct: await settingsRepo.getCommissionPct(),
      referralRewardAmount: await settingsRepo.getReferralReward(),
      referralCommissionPct: await settingsRepo.getReferralCommissionPct(),
      referralCommissionMonths: await settingsRepo.getReferralCommissionMonths(),
      productOfferMaxPages: await settingsRepo.getProductOfferMaxPages(),
      minWithdrawAmount: await settingsRepo.getMinWithdrawAmount(),
      shopResolveEnabled: await settingsRepo.getShopResolveEnabled(),
      shopResolveBatchSize: await settingsRepo.getShopResolveBatchSize(),
      shopCrawlEnabled: await settingsRepo.getShopCrawlEnabled(),
      shopCrawlMaxShops: await settingsRepo.getShopCrawlMaxShops(),
      shopCrawlMaxPages: await settingsRepo.getShopCrawlMaxPages(),
      shopDetailEnabled: await settingsRepo.getShopDetailEnabled(),
      shopDetailBatchSize: await settingsRepo.getShopDetailBatchSize(),
      jobMode: await settingsRepo.getJobMode(),
      continuousGaps: await settingsRepo.getContinuousGaps(),
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
    if (req.body.referralCommissionPct !== undefined) {
      const pct = Number(req.body.referralCommissionPct);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ error: 'body.referralCommissionPct must be a number between 0 and 100' });
      }
      response.referralCommissionPct = await settingsRepo.setReferralCommissionPct(pct);
    }
    if (req.body.referralCommissionMonths !== undefined) {
      const months = Number(req.body.referralCommissionMonths);
      if (!Number.isInteger(months) || months < 0 || months > 1200) {
        return res.status(400).json({ error: 'body.referralCommissionMonths must be an integer between 0 (no limit) and 1200' });
      }
      response.referralCommissionMonths = await settingsRepo.setReferralCommissionMonths(months);
    }
    if (req.body.productOfferMaxPages !== undefined) {
      const pages = Number(req.body.productOfferMaxPages);
      if (!Number.isInteger(pages) || pages < 1 || pages > 100) {
        return res.status(400).json({ error: 'body.productOfferMaxPages must be an integer between 1 and 100' });
      }
      response.productOfferMaxPages = await settingsRepo.setProductOfferMaxPages(pages);
    }
    if (req.body.minWithdrawAmount !== undefined) {
      const amount = Number(req.body.minWithdrawAmount);
      if (!Number.isInteger(amount) || amount < 0 || amount > 100000000) {
        return res.status(400).json({ error: 'body.minWithdrawAmount must be an integer between 0 and 100000000' });
      }
      response.minWithdrawAmount = await settingsRepo.setMinWithdrawAmount(amount);
    }
    // The kill switch for the shop-name resolution cron. Flipping it here takes
    // effect on the next tick - no redeploy, which is the point of it being a
    // setting rather than an env var.
    if (req.body.shopResolveEnabled !== undefined) {
      response.shopResolveEnabled = await settingsRepo.setShopResolveEnabled(!!req.body.shopResolveEnabled);
    }
    if (req.body.shopResolveBatchSize !== undefined) {
      const size = Number(req.body.shopResolveBatchSize);
      if (!Number.isInteger(size) || size < 1 || size > 50) {
        return res.status(400).json({ error: 'body.shopResolveBatchSize must be an integer between 1 and 50' });
      }
      response.shopResolveBatchSize = await settingsRepo.setShopResolveBatchSize(size);
    }
    // Kill switch for the nightly per-shop crawl, same no-redeploy contract.
    if (req.body.shopCrawlEnabled !== undefined) {
      response.shopCrawlEnabled = await settingsRepo.setShopCrawlEnabled(!!req.body.shopCrawlEnabled);
    }
    if (req.body.shopCrawlMaxShops !== undefined) {
      const maxShops = Number(req.body.shopCrawlMaxShops);
      if (!Number.isInteger(maxShops) || maxShops < 1 || maxShops > 50) {
        return res.status(400).json({ error: 'body.shopCrawlMaxShops must be an integer between 1 and 50' });
      }
      response.shopCrawlMaxShops = await settingsRepo.setShopCrawlMaxShops(maxShops);
    }
    if (req.body.shopCrawlMaxPages !== undefined) {
      const maxPages = Number(req.body.shopCrawlMaxPages);
      if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) {
        return res.status(400).json({ error: 'body.shopCrawlMaxPages must be an integer between 1 and 20' });
      }
      response.shopCrawlMaxPages = await settingsRepo.setShopCrawlMaxPages(maxPages);
    }
    // Kill switch for shop detail enrichment (avatar/rating/followers). Without
    // an avatar a shop never reaches 'linked', so this switch is also what
    // decides whether new shops can ever show up in the app.
    if (req.body.shopDetailEnabled !== undefined) {
      response.shopDetailEnabled = await settingsRepo.setShopDetailEnabled(!!req.body.shopDetailEnabled);
    }
    if (req.body.shopDetailBatchSize !== undefined) {
      const size = Number(req.body.shopDetailBatchSize);
      if (!Number.isInteger(size) || size < 1 || size > 60) {
        return res.status(400).json({ error: 'body.shopDetailBatchSize must be an integer between 1 and 60' });
      }
      response.shopDetailBatchSize = await settingsRepo.setShopDetailBatchSize(size);
    }
    // Which clock drives the data jobs. Takes effect within a minute in both
    // directions: the loops re-read it every cycle, the crons every tick.
    if (req.body.jobMode !== undefined) {
      const mode = String(req.body.jobMode);
      if (!settingsRepo.JOB_MODES.includes(mode)) {
        return res.status(400).json({ error: `body.jobMode must be one of ${settingsRepo.JOB_MODES.join(', ')}` });
      }
      response.jobMode = await settingsRepo.setJobMode(mode);
    }
    if (req.body.continuousGaps !== undefined) {
      const gaps = req.body.continuousGaps || {};
      // Same bounds the repository clamps to, so a value the dashboard accepts
      // is a value the loops will actually use - silently storing 1 and running
      // 300 is worse than refusing it.
      const bounds = {
        sourceSec: [0, 3600],
        shopeeSec: [1, 3600],
        crawlSec: [1, 3600],
        idleSec: [30, 86400],
      };
      const patch = {};
      for (const [field, [min, max]] of Object.entries(bounds)) {
        if (gaps[field] === undefined) continue;
        const seconds = Number(gaps[field]);
        if (!Number.isInteger(seconds) || seconds < min || seconds > max) {
          return res
            .status(400)
            .json({ error: `body.continuousGaps.${field} must be an integer between ${min} and ${max}` });
        }
        patch[field] = seconds;
      }
      response.continuousGaps = await settingsRepo.setContinuousGaps(patch);
    }
    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editable mobile-app config document. GET returns what is stored plus the
// built-in defaults, so the dashboard can offer a "reset to default" per
// section; PUT runs the same validator the app-facing route reads through, so
// a bad edit can never reach a device.
app.get('/admin/app-config', adminAuth.requireAdmin, async (_req, res) => {
  try {
    res.json({
      version: await appConfigRepo.getVersion(),
      config: await appConfigRepo.getDocument(),
      defaults: appConfigRepo.DEFAULTS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/app-config', adminAuth.requireAdmin, async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'body must be a config object' });
    }
    const config = await appConfigRepo.saveDocument(req.body.config ?? req.body);
    res.json({ version: await appConfigRepo.getVersion(), config });
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

// Per-order referral commissions (referral programme v2). Listed for the
// admin payout queue, filterable by payout_status; marked paid one row at a
// time after the bank transfer, like every other payout in this system.
app.get('/admin/referral-commissions', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { payoutStatus } = req.query;
    if (payoutStatus && !['unpaid', 'paid', 'revoked'].includes(payoutStatus)) {
      return res.status(400).json({ error: "query.payoutStatus must be one of 'unpaid'|'paid'|'revoked'" });
    }
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;
    res.json(await referralCommissionsRepo.listAll({ payoutStatus, limit, offset }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/admin/referral-commissions/:id/payout', adminAuth.requireAdmin, async (req, res) => {
  try {
    res.json(await referralCommissionsRepo.markPaid(req.params.id));
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

// Job history that survives a restart, unlike the in-memory status above -
// which matters because this repo auto-deploys on every push, so "what
// happened on last night's scrape" was routinely wiped before anyone looked.
app.get('/admin/job-runs', adminAuth.requireAdmin, async (req, res) => {
  try {
    res.json(
      await jobRunsRepo.listRecent({
        job: req.query.job || undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      })
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Shop: tra tên -> shop_id ───────────────────────────────────────────────
// The manual half of lib/shopResolution.js. Two shapes, deliberately different:
//
//  - { shopName } resolves exactly one name and answers with the outcome. One
//    API call, so it finishes well inside any proxy timeout, and an admin
//    fixing one shop wants the answer, not a job id to poll.
//  - { batchSize } starts a sweep in the background (202 + poll via GET), the
//    same contract as /admin/product-offer-sync, because a full batch paces
//    itself against Shopee and takes minutes.
app.post('/admin/shops/resolve', adminAuth.requireAdmin, async (req, res) => {
  try {
    if (req.body?.shopName !== undefined) {
      const shopName = String(req.body.shopName).trim();
      if (!shopName) return res.status(400).json({ error: 'body.shopName must not be blank' });
      return res.json(await shopResolution.resolveShopNameNow(shopName));
    }
    // `batchSize: 0` is falsy but present, and must be rejected rather than
    // quietly falling through to the configured default - an admin who types 0
    // is asking for nothing to run, not for a full batch.
    const hasBatchSize = req.body?.batchSize !== undefined && req.body?.batchSize !== null && req.body?.batchSize !== '';
    const batchSize = hasBatchSize
      ? Number(req.body.batchSize)
      : await settingsRepo.getShopResolveBatchSize();
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
      return res.status(400).json({ error: 'body.batchSize must be an integer between 1 and 50' });
    }
    res.status(202).json(shopNameResolveJob.start({ batchSize }));
  } catch (err) {
    sendShopeeApiError(res, err);
  }
});

app.get('/admin/shops/resolve', adminAuth.requireAdmin, (_req, res) => {
  res.json(shopNameResolveJob.getStatus());
});

// Defaults to `linked` on purpose: every keyword search saves the shops it
// turned up as a free discovery, so `discovered` rows legitimately outnumber
// usable ones and would otherwise bury the list. `?status=` (or `status=all`)
// opens it up.
app.get('/admin/shops', adminAuth.requireAdmin, async (req, res) => {
  try {
    const status = req.query.status === 'all' ? undefined : req.query.status || 'linked';
    const filters = {
      search: req.query.search || undefined,
      status,
      featuredOnly: req.query.featured === '1' ? true : undefined,
    };
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;
    const [items, total] = await Promise.all([
      shopsRepo.list({ ...filters, limit, offset, sort: req.query.sort }),
      shopsRepo.count(filters),
    ]);
    res.json({ items, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Curation only. Everything else on a shop row comes from Shopee and is
// rewritten by the next sync (lib/repositories/shops.js#upsertFromApi
// deliberately leaves these three alone), so these are the only fields an admin
// can own. `isActive: false` is the per-shop kill switch: it hides the shop from
// the app without deleting anything or touching its products.
app.put('/admin/shops/:id', adminAuth.requireAdmin, async (req, res) => {
  try {
    const shop = await shopsRepo.updateCuration(req.params.id, {
      isActive: req.body?.isActive,
      isFeatured: req.body?.isFeatured,
      sortOrder: req.body?.sortOrder === undefined ? undefined : Number(req.body.sortOrder),
    });
    if (!shop) return res.status(404).json({ error: 'not_found' });
    res.json(shop);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// The FK is ON DELETE SET NULL, so this unlinks the shop's products rather than
// deleting them - the catalog rows were scraped independently and are still
// worth showing. The name resolution row survives too and will simply re-resolve
// the name on a later run.
app.delete('/admin/shops/:id', adminAuth.requireAdmin, async (req, res) => {
  try {
    const removed = await shopsRepo.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, shopId: removed.shopId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// One live call to GET /api/v3/offer/shop for the rating/sold/follower fields
// the list endpoint doesn't carry. Answered synchronously because it really is
// a single request - unlike the crawl endpoints, there is no browser involved.
app.post('/admin/shops/:id/refresh', adminAuth.requireAdmin, async (req, res) => {
  try {
    const current = await shopsRepo.getById(req.params.id);
    if (!current) return res.status(404).json({ error: 'not_found' });
    const detail = await shopeeAffiliateApi.getShopDetail(current.shopId);
    if (!detail) return res.status(502).json({ error: 'empty_detail' });
    res.json(await shopsRepo.applyDetail(current.shopId, detail));
  } catch (err) {
    sendShopeeApiError(res, err);
  }
});

// The resolution queue itself. `?status=ambiguous` is the one an admin has to
// work by hand - nothing else can break a tie between two shops that genuinely
// share a display name.
app.get('/admin/shop-name-resolutions', adminAuth.requireAdmin, async (req, res) => {
  try {
    const { items, total } = await shopNameResolutionsRepo.listForAdmin({
      status: req.query.status || undefined,
      search: req.query.search || undefined,
      limit: Math.min(Number(req.query.limit) || 50, 200),
      offset: Number(req.query.offset) || 0,
    });
    res.json({ items, total, counts: await shopNameResolutionsRepo.countByStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// An admin naming the right shop themselves, which is the only way out of
// `ambiguous`. The shop must already exist - it does, because every search
// candidate was saved when the name was first attempted.
app.put('/admin/shop-name-resolutions/:id', adminAuth.requireAdmin, async (req, res) => {
  try {
    if (!req.body?.shopId) return res.status(400).json({ error: 'body.shopId is required' });
    const result = await shopResolution.resolveManually(req.params.id, req.body.shopId);
    if (!result) return res.status(404).json({ error: 'not_found' });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── Shop: crawl sản phẩm theo shop ─────────────────────────────────────────
// The manual half of the nightly sweep (cron `30 2 * * *` below). Two shapes:
//
//  - { shopId } crawls exactly that shop, queue rules and all, INCLUDING a shop
//    still marked `discovered` - that is the only way one gets crawled, and it
//    is how an admin promotes an interesting discovery into a real shop.
//  - { maxShops, maxPages } runs the ordinary sweep right now.
//
// Always 202 + poll: even one shop is five page loads behind a select-all and a
// CSV download, which outlives Cloudflare's ~100s upstream timeout.
app.post('/admin/shop-product-sync', adminAuth.requireAdmin, async (req, res) => {
  try {
    const shopId = req.body?.shopId ? String(req.body.shopId).trim() : undefined;
    if (req.body?.shopId !== undefined && !shopId) {
      return res.status(400).json({ error: 'body.shopId must not be blank' });
    }

    // Same "0 is present, not absent" care as /admin/shops/resolve: an admin
    // typing 0 is asking for nothing to run, not for the configured default.
    const has = (v) => v !== undefined && v !== null && v !== '';
    const maxShops = has(req.body?.maxShops)
      ? Number(req.body.maxShops)
      : await settingsRepo.getShopCrawlMaxShops();
    if (!Number.isInteger(maxShops) || maxShops < 1 || maxShops > 50) {
      return res.status(400).json({ error: 'body.maxShops must be an integer between 1 and 50' });
    }
    const maxPages = has(req.body?.maxPages)
      ? Number(req.body.maxPages)
      : await settingsRepo.getShopCrawlMaxPages();
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 20) {
      return res.status(400).json({ error: 'body.maxPages must be an integer between 1 and 20' });
    }

    res.status(202).json(shopProductSyncJob.start({ shopId, maxShops, maxPages, trigger: 'admin' }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/admin/shop-product-sync', adminAuth.requireAdmin, (_req, res) => {
  res.json(shopProductSyncJob.getStatus());
});

// The manual half of lib/shopLinkBackfill.js. Answers synchronously rather than
// 202+poll like the two jobs above: this one makes a single batched addlivetag
// call, so it finishes in seconds and holds nothing - there is no long-running
// state worth polling for.
app.post('/admin/shop-link-backfill', adminAuth.requireAdmin, async (req, res) => {
  try {
    const has = (v) => v !== undefined && v !== null && v !== '';
    const batchSize = has(req.body?.batchSize) ? Number(req.body.batchSize) : 50;
    // 100 is addlivetag's own per-request ceiling for product-data-batch.php.
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) {
      return res.status(400).json({ error: 'body.batchSize must be an integer between 1 and 100' });
    }
    res.json(await withJobRun('shop-link-backfill', 'admin', () => backfillMissingShopIds({ batchSize })));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// The manual half of lib/shopDetailEnrichment.js. Runs whatever the
// `shop_detail_enabled` switch says, on purpose: that switch governs the cron,
// and an admin pressing the button is exactly how the batch gets eyeballed
// before the switch is turned on.
app.post('/admin/shop-detail-enrich', adminAuth.requireAdmin, async (req, res) => {
  try {
    const has = (v) => v !== undefined && v !== null && v !== '';
    const batchSize = has(req.body?.batchSize)
      ? Number(req.body.batchSize)
      : await settingsRepo.getShopDetailBatchSize();
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 60) {
      return res.status(400).json({ error: 'body.batchSize must be an integer between 1 and 60' });
    }
    res.json(await withJobRun('shop-detail-enrich', 'admin', () => enrichShopDetails({ batchSize })));
  } catch (err) {
    sendShopeeApiError(res, err);
  }
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

  // Any job_runs row still marked 'running' belongs to a process that no
  // longer exists - this service is a single process, so nothing live can be
  // holding one at the moment we boot. Without this, one deploy landing
  // mid-crawl (which happens often here: every push to master redeploys)
  // leaves a row that claims to be running forever and a dashboard that lies.
  jobRunsRepo
    .sweepZombies()
    .then((count) => count > 0 && console.log(`job-runs: đánh dấu ${count} lượt chạy bị ngắt do restart`))
    .catch((err) => console.error('job-runs: zombie sweep failed', err.message));

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
    productOfferSyncJob.start({ maxPages, trigger: 'cron' });
  } catch (err) {
    console.error('cron product-offer-sync failed', err.message);
  }
});

// Category backfill for catalog rows missing it (post-migration and admin
// CSV/XLSX imports never have one) - every 15 minutes in small batches, see
// lib/categoryEnrichment.js for why this stays off the browser-automation
// fallback and off one large sweep.
//
// Does NOT take browserJobLock: this job deliberately stays off browser
// automation entirely (it uses the batch API, see the comment in that file),
// so making it queue behind a crawl would cost it hours for no reason.
cron.schedule('*/15 * * * *', async () => {
  if (await continuousJobs.cronIsSuppressed('category-backfill')) return;
  // An empty queue is the normal case - ~96 of these a day would otherwise
  // bury the runs that actually did work.
  withJobRun('category-backfill', 'cron', () => backfillMissingCategories(), {
    discardIf: (result) => result && result.scanned === 0,
  })
    .then((result) => console.log(`cron category-backfill: ${JSON.stringify(result)}`))
    .catch((err) => console.error('cron category-backfill failed', err.message));
});

// Shop attribution backfill for the catalog rows that carry a shop name and no
// shop - four times an hour, ~200 rows/hour, so the 3108 rows that predate
// reading addlivetag's shop_id clear in under a day and then the queue sits
// empty. Same minutes-offset discipline as the jobs below.
//
// No kill switch and no lock, for the same reason as the category backfill: it
// only ever talks to addlivetag, never to Shopee, so there is no account to
// protect and no browser to contend for.
cron.schedule('8,23,38,53 * * * *', async () => {
  if (await continuousJobs.cronIsSuppressed('shop-link-backfill')) return;
  withJobRun('shop-link-backfill', 'cron', () => backfillMissingShopIds(), {
    discardIf: (result) => result && result.scanned === 0,
  })
    .then((result) => console.log(`cron shop-link-backfill: ${JSON.stringify(result)}`))
    .catch((err) => console.error('cron shop-link-backfill failed', err.message));
});

// Shop detail enrichment - avatar, cover, rating, sold total, followers - three
// times an hour at ~60 shops/hour. Deliberately slow: it spends Shopee calls,
// and there is no deadline, because a shop with no avatar simply stays out of
// the app until this reaches it (see shops.refreshProductCounts).
//
// Gated on `shop_detail_enabled`, re-read every tick, like the two jobs below:
// anything that touches Shopee must be stoppable from the dashboard without a
// redeploy.
cron.schedule('7,27,47 * * * *', async () => {
  try {
    if (await continuousJobs.cronIsSuppressed('shop-detail-enrich')) return;
    if (!(await settingsRepo.getShopDetailEnabled())) return;
    const batchSize = await settingsRepo.getShopDetailBatchSize();
    const result = await withJobRun('shop-detail-enrich', 'cron', () => enrichShopDetails({ batchSize }), {
      discardIf: (r) => r && r.scanned === 0,
    });
    console.log(`cron shop-detail-enrich: ${JSON.stringify(result)}`);
  } catch (err) {
    console.error('cron shop-detail-enrich failed', err.message);
  }
});

// Shop-name resolution, ten past every ten minutes. The odd minutes are
// deliberate: not :00 (the 6:00 scrape), not a multiple of 15 (the category
// backfill), so the three jobs never wake together on a 2-core VPS.
//
// Gated on the `shop_resolve_enabled` setting, re-read on EVERY tick - that is
// the kill switch, and it has to work without a redeploy because this job talks
// to Shopee's own API and the blast radius of leaving it running while blocked
// is the affiliate account itself.
cron.schedule('3,13,23,33,43,53 * * * *', async () => {
  try {
    if (await continuousJobs.cronIsSuppressed('shop-name-resolve')) return;
    if (!(await settingsRepo.getShopResolveEnabled())) return;
    shopNameResolveJob.start({
      batchSize: await settingsRepo.getShopResolveBatchSize(),
      trigger: 'cron',
    });
  } catch (err) {
    console.error('cron shop-name-resolve failed', err.message);
  }
});

// Per-shop product crawl, 02:30 nightly. Three and a half hours ahead of the
// 6:00 product-offer scrape, so even a sweep that badly overruns its ~15 minute
// budget still finishes first - and if it somehow doesn't, browserJobLock makes
// the scrape wait rather than letting two jobs drive the same browser.
//
// Gated on `shop_crawl_enabled`, re-read on every tick: this is the heaviest
// job in the service and has to be stoppable from the dashboard without a
// redeploy.
cron.schedule('30 2 * * *', async () => {
  try {
    if (await continuousJobs.cronIsSuppressed('shop-product-crawl')) return;
    if (!(await settingsRepo.getShopCrawlEnabled())) return;
    shopProductSyncJob.start({
      maxShops: await settingsRepo.getShopCrawlMaxShops(),
      maxPages: await settingsRepo.getShopCrawlMaxPages(),
      trigger: 'cron',
    });
  } catch (err) {
    console.error('cron shop-product-crawl failed', err.message);
  }
});

// The other clock. Which of the two actually drives the jobs is the `job_mode`
// setting, read fresh by both sides - see lib/continuousJobs.js.
continuousJobs.start();

process.on('SIGTERM', async () => {
  continuousJobs.stop();
  await browserManager.shutdown();
  process.exit(0);
});
process.on('SIGINT', async () => {
  continuousJobs.stop();
  await browserManager.shutdown();
  process.exit(0);
});
