/**
 * Client cho các JSON API của affiliate.shopee.vn mà cookie thuần gọi được.
 * Danh mục endpoint + những cái BỊ CHẶN: docs/shopee-affiliate-api-spec.txt.
 *
 * ── Vì sao dùng context.request của Playwright chứ không phải fetch + đọc
 *    storageState.json ──────────────────────────────────────────────────────
 * Lý do quyết định là tính nhất quán của cookie jar. `context.request` dùng
 * chung jar ĐANG SỐNG với các tab. Shopee xoay SPC_ST; Set-Cookie trên response
 * API cập nhật luôn phiên mà crawler đang dùng. `fetch` đọc một BẢN CHỤP trên
 * đĩa, cũ đi âm thầm và không ghi ngược - trong cùng một tiến trình sẽ có hai
 * phiên phân kỳ. Đó là kiểu hỏng tệ nhất cho thứ dính tới tiền.
 * Tiền lệ: productOfferScraper.js:56 đã dùng page.context().request.get để tải
 * CSV và chạy tốt cả năm nay.
 *
 * NÓI THẲNG ĐIỂM YẾU: APIRequestContext là HTTP client phía Node, KHÔNG chung
 * TLS/JA3 fingerprint với Chromium. Đừng lấy "giống fingerprint" làm lý do.
 * Chính vì điểm yếu đó (và vì spec §8 cảnh báo offer/shop/list có thể bị siết
 * bất cứ lúc nào) mà module này có 2 nấc transport - xem TRANSPORT bên dưới.
 */

const browserManager = require('./browserManager');
const browserJobLock = require('./browserJobLock');
const settingsRepo = require('./repositories/settings');

const BASE_URL = (process.env.SHOPEE_API_BASE_URL || 'https://affiliate.shopee.vn').replace(/\/+$/, '');
const MIN_INTERVAL_MS = parseInt(process.env.SHOPEE_API_MIN_INTERVAL_MS || '1200', 10);
const TIMEOUT_MS = parseInt(process.env.SHOPEE_API_TIMEOUT_MS || '15000', 10);
const RETRY_ATTEMPTS = parseInt(process.env.SHOPEE_API_RETRY_ATTEMPTS || '3', 10);
const BLOCK_COOLDOWN_MS = parseInt(process.env.SHOPEE_API_BLOCK_COOLDOWN_MS || String(30 * 60 * 1000), 10);
const SHOP_SEARCH_PAGE_LIMIT = parseInt(process.env.SHOP_SEARCH_PAGE_LIMIT || '20', 10);
// offer/shop/list BẮT BUỘC có sort_type - bỏ trống thì Shopee trả
// `code 400: params error,property:sort_type` (đo thật 2026-09-23; spec §1.1 ghi
// nó như tuỳ chọn nên đừng tin chỗ đó). 2 = hoa hồng giảm dần.
const SHOP_SEARCH_SORT_TYPE = parseInt(process.env.SHOP_SEARCH_SORT_TYPE || '2', 10);
const AFFILIATE_ID_TTL_MS = parseInt(process.env.SHOPEE_AFFILIATE_ID_TTL_MS || String(6 * 3600 * 1000), 10);
const AFFILIATE_ID_KEY = 'shopee_affiliate_id';

// Trang tham chiếu. Spec §0: chỉ cần accept / user-agent / referer, TUYỆT ĐỐI
// không cần x-sap-ri, x-sap-sec, af-ac-enc-*, csrf-token, x-sz-sdk-version.
const REFERER = `${BASE_URL}/offer/shop`;

// Dùng khi không đọc được navigator.userAgent từ browser thật.
const FALLBACK_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// ─── Lỗi ────────────────────────────────────────────────────────────────────
// Cố ý là 3 lớp ANH EM cùng kế thừa Error, không lồng nhau: caller thường viết
// `catch (e) { if (e instanceof BlockedError) ... }` và nếu BlockedError là con
// của ShopeeApiError thì một nhánh `instanceof ShopeeApiError` đặt nhầm thứ tự
// sẽ nuốt mất cả hai loại nghiêm trọng kia.

/** code !== 0, body không phải JSON, 5xx, lỗi mạng - mọi thứ còn lại. */
class ShopeeApiError extends Error {
  constructor(message, { status, code, url, retryable = false } = {}) {
    super(message);
    this.name = 'ShopeeApiError';
    this.status = status;
    this.code = code;
    this.url = url;
    this.retryable = retryable;
  }
}

/** Cookie chết. Cần NGƯỜI vào chạy `npm run seed-login`; retry vô nghĩa. */
class SessionExpiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SessionExpiredError';
    this.retryable = false;
  }
}

/** Chống bot (90309999). Lùi mạnh. Retry chính là thứ làm block nặng thêm. */
class BlockedError extends Error {
  constructor(message, { retryAfterMs } = {}) {
    super(message);
    this.name = 'BlockedError';
    this.retryable = false;
    this.retryAfterMs = retryAfterMs;
  }
}

// ─── Trạng thái module ──────────────────────────────────────────────────────
let blockedUntil = 0;
let lastCallAt = 0;
let gateChain = Promise.resolve();
let userAgent = null;
let apiPage = null; // tab dành riêng cho nấc page-transport, mở lười
let affiliateIdCache = null; // { value, fetchedAt }

// request | page. Tự leo lên 'page' lần đầu dính BlockedError (trừ khi bị ép
// bằng env), vì chữ ký chống bot sinh TRONG trang: trang gọi được cái mà cookie
// replay không gọi được.
const FORCED_TRANSPORT = process.env.SHOPEE_API_TRANSPORT || '';
let activeTransport = FORCED_TRANSPORT === 'page' ? 'page' : 'request';

const stats = {
  calls: 0,
  ok: 0,
  failed: 0,
  blocks: 0,
  lastSuccessAt: null,
  lastErrorAt: null,
  lastError: null,
  consecutiveFailures: 0,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Cổng tuần tự toàn cục ──────────────────────────────────────────────────
/**
 * Ép tối thiểu MIN_INTERVAL_MS giữa HAI lời gọi BẤT KỲ tới affiliate.shopee.vn.
 * Một chuỗi promise duy nhất ở scope module, nên mọi caller (job tra tên, route
 * admin, health check) chung MỘT ngân sách - chứ không phải mỗi caller một cái
 * rate limit riêng rồi cộng dồn thành ba lần tốc độ dự kiến.
 */
function gate() {
  const next = gateChain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
  });
  // Nuốt lỗi trên chuỗi đã lưu, nếu không một lần ném sẽ đầu độc mọi lời gọi sau.
  gateChain = next.catch(() => {});
  return next;
}

// ─── Cầu dao ────────────────────────────────────────────────────────────────
function assertNotBlocked() {
  const remaining = blockedUntil - Date.now();
  if (remaining > 0) {
    throw new BlockedError(
      `circuit breaker đang mở, còn ${Math.ceil(remaining / 1000)}s`,
      { retryAfterMs: remaining }
    );
  }
}

function openBreaker(reason) {
  blockedUntil = Date.now() + BLOCK_COOLDOWN_MS;
  stats.blocks += 1;
  console.error(
    `[shopee-api] BỊ CHẶN (${reason}). Nghỉ ${Math.round(BLOCK_COOLDOWN_MS / 60000)} phút, ` +
      `không chạm mạng tới ${new Date(blockedUntil).toISOString()}.`
  );
  // Lần sau thử nấc trong-trang: chữ ký chống bot do SDK sinh trong trang, nên
  // một tab thật gọi được thứ mà cookie replay không gọi được.
  if (activeTransport === 'request' && FORCED_TRANSPORT !== 'request') {
    activeTransport = 'page';
    console.error('[shopee-api] chuyển transport sang "page" cho các lần gọi sau.');
  }
}

// ─── Phân loại response ─────────────────────────────────────────────────────
/**
 * Một chỗ duy nhất quyết định "đây là lỗi loại gì", đúng theo spec §0. Mọi
 * nhánh đều NÉM hoặc trả về data; không có nhánh nào trả về undefined im lặng.
 */
function classify({ status, url, text }) {
  if (/passport|login/i.test(url || '')) {
    throw new SessionExpiredError(`bị đá về trang đăng nhập: ${url}`);
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* để nguyên null, xử lý bên dưới */
  }

  // Chống bot: nhận diện TRƯỚC 401/403, vì nó cũng trả về 403 nhưng ý nghĩa
  // hoàn toàn khác (phiên vẫn sống, chỉ là đang bị chặn).
  if (json && (json.error === 90309999 || String(json.error) === '90309999' || json.redirect_to_error_page === true)) {
    throw new BlockedError(`anti-bot 90309999 trên ${url}`);
  }

  // Spec §0: 401/403 KHÔNG kèm 90309999 nghĩa là phiên đã chết.
  if (status === 401 || status === 403) {
    throw new SessionExpiredError(`HTTP ${status} trên ${url}`);
  }

  if (status >= 500) {
    throw new ShopeeApiError(`HTTP ${status} trên ${url}`, { status, url, retryable: true });
  }

  if (!json) {
    // Thường là trang HTML lỗi hoặc trang chặn - không retry được gì hữu ích,
    // nhưng cũng có thể là response cụt do mạng, nên cho retry.
    const snippet = String(text || '').slice(0, 120).replace(/\s+/g, ' ');
    throw new ShopeeApiError(`body không phải JSON (HTTP ${status}) từ ${url}: ${snippet}`, {
      status,
      url,
      retryable: true,
    });
  }

  if (json.code !== 0) {
    if (/login|token|auth|expire/i.test(json.msg || '')) {
      throw new SessionExpiredError(`code ${json.code}: ${json.msg}`);
    }
    throw new ShopeeApiError(`code ${json.code}: ${json.msg}`, { status, code: json.code, url });
  }

  return json.data;
}

// ─── Transport ──────────────────────────────────────────────────────────────
/**
 * UA của chính browser đang chạy, để header khớp với cookie jar phát ra nó.
 * "HeadlessChrome" bị thay thành "Chrome": Playwright headless tự quảng cáo
 * mình là headless trong UA, và đó là một dấu hiệu bot miễn phí mà ta cho
 * không - trong khi spec §0 đã verify Shopee chỉ cần một UA Chrome bình thường.
 */
async function getUserAgent() {
  if (process.env.SHOPEE_USER_AGENT) return process.env.SHOPEE_USER_AGENT;
  if (userAgent) return userAgent;
  try {
    const ctx = await browserManager.getContext();
    const page = await ctx.newPage();
    try {
      userAgent = await page.evaluate(() => navigator.userAgent);
    } finally {
      await page.close().catch(() => {});
    }
  } catch (err) {
    console.error('[shopee-api] không đọc được navigator.userAgent, dùng UA mặc định:', err.message);
  }
  userAgent = (userAgent || FALLBACK_USER_AGENT).replace(/HeadlessChrome/g, 'Chrome');
  return userAgent;
}

function buildUrl(path, params = {}) {
  const url = new URL(path, BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Nấc 1: rẻ, không tốn tab, không tốn RAM. */
async function viaRequest(url) {
  const ctx = await browserManager.getContext();
  const res = await ctx.request.get(url, {
    headers: {
      accept: 'application/json',
      'user-agent': await getUserAgent(),
      referer: REFERER,
    },
    timeout: TIMEOUT_MS,
    // Tự phân loại status trong classify(), đừng để Playwright ném trước.
    failOnStatusCode: false,
  });
  return { status: res.status(), url: res.url(), text: await res.text() };
}

async function getApiPage() {
  if (apiPage && !apiPage.isClosed()) return apiPage;
  const ctx = await browserManager.getContext();
  apiPage = await ctx.newPage();
  await apiPage.goto(REFERER, { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (/passport|login/i.test(apiPage.url())) {
    const url = apiPage.url();
    await apiPage.close().catch(() => {});
    apiPage = null;
    throw new SessionExpiredError(`bị đá về trang đăng nhập khi mở tab API: ${url}`);
  }
  return apiPage;
}

/**
 * Nấc 2: fetch CHẠY TRONG trang. Request khi đó mang đúng TLS session, cookie,
 * Referer, sec-ch-ua và mọi header chống bot mà SDK của Shopee tự gắn.
 *
 * Lấy lock bằng tryRun (KHÔNG chờ): một lời gọi API không bao giờ được xếp hàng
 * sau lượt crawl 20 phút. Browser bận thì rơi về nấc 1 - kém hơn, nhưng có kết
 * quả còn hơn hỏng.
 */
async function viaPage(url) {
  const outcome = await browserJobLock.tryRun('shopee-api-fetch', async () => {
    const page = await getApiPage();
    try {
      return await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: 'include', headers: { accept: 'application/json' } });
        return { status: r.status, url: r.url, text: await r.text() };
      }, url);
    } catch (err) {
      // Tab hỏng/crash: vứt đi để lần sau mở lại tab sạch.
      await apiPage?.close().catch(() => {});
      apiPage = null;
      throw err;
    }
  });

  if (!outcome.ran) {
    console.error(`[shopee-api] browser đang bận (${outcome.busyWith?.name}), tạm dùng transport "request".`);
    return viaRequest(url);
  }
  return outcome.result;
}

async function transport(url) {
  try {
    return activeTransport === 'page' ? await viaPage(url) : await viaRequest(url);
  } catch (err) {
    if (err instanceof SessionExpiredError || err instanceof BlockedError) throw err;
    // Timeout / DNS / socket - đáng retry, khác hẳn "Shopee trả lời là không".
    throw new ShopeeApiError(`transport lỗi trên ${url}: ${err.message}`, { url, retryable: true });
  }
}

// ─── Retry ──────────────────────────────────────────────────────────────────
/**
 * Jitter mũ 1.5s → 3s → 6s (±30%). CHỈ retry thứ được đánh dấu retryable
 * (mạng/timeout/5xx/body cụt). TUYỆT ĐỐI không retry BlockedError (retry chính
 * là thứ làm block nặng thêm) hay SessionExpiredError (cookie sẽ không tự sống
 * lại sau 3 giây).
 */
async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt < Math.max(1, RETRY_ATTEMPTS); attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!err.retryable) throw err;
      lastErr = err;
      if (attempt === RETRY_ATTEMPTS - 1) break;
      const base = 1500 * Math.pow(2, attempt);
      await sleep(Math.round(base * (0.7 + Math.random() * 0.6)));
    }
  }
  throw lastErr;
}

// ─── Lời gọi ────────────────────────────────────────────────────────────────
async function callApi(path, params) {
  assertNotBlocked();
  const url = buildUrl(path, params);
  stats.calls += 1;

  try {
    const data = await withRetry(async () => {
      await gate();
      // Kiểm lại: trong lúc xếp hàng ở cổng, một lời gọi khác có thể đã làm nổ
      // cầu dao. Không có dòng này thì cả một lô đang chờ sẽ lao thẳng vào
      // Shopee ngay sau khi nó vừa bảo ta dừng lại.
      assertNotBlocked();
      return classify(await transport(url));
    });
    stats.ok += 1;
    stats.consecutiveFailures = 0;
    stats.lastSuccessAt = new Date().toISOString();
    return data;
  } catch (err) {
    stats.failed += 1;
    stats.consecutiveFailures += 1;
    stats.lastErrorAt = new Date().toISOString();
    stats.lastError = `${err.name}: ${err.message}`;
    // Chỉ mở cầu dao cho lần chặn THẬT, không phải cho lần bị chính cầu dao
    // đang mở chặn lại - nếu không thì một cú 90309999 sẽ tự gia hạn mãi mãi.
    if (err instanceof BlockedError && err.retryAfterMs === undefined) openBreaker(err.message);
    throw err;
  }
}

// ─── API công khai ──────────────────────────────────────────────────────────

/**
 * Spec §1.1. keyword khớp MỜ (substring) - "almen" ra cả "ROYALMEN VIỆT NAM".
 * Hàm này CỐ Ý trả nguyên danh sách thô, không tự chọn hộ: việc so khớp chính
 * xác là của lib/shopResolution.js, và "lấy đại phần tử đầu" là cách gán sản
 * phẩm nhầm shop - tệ hơn để trống.
 * Keyword không ra gì thì trả [] chứ không ném: "không có shop tên này" là một
 * câu trả lời hợp lệ, không phải lỗi.
 */
async function searchShopsByKeyword(
  keyword,
  { pageOffset = 0, pageLimit = SHOP_SEARCH_PAGE_LIMIT, sortType = SHOP_SEARCH_SORT_TYPE } = {}
) {
  const data = await callApi('/api/v3/offer/shop/list', {
    keyword: keyword == null ? '' : String(keyword).trim(),
    page_offset: pageOffset,
    page_limit: pageLimit,
    sort_type: sortType,
  });
  return Array.isArray(data?.list) ? data.list : [];
}

/** Spec §1.2 - rating / sold_total / follower_count mà shop/list không có. */
async function getShopDetail(shopId) {
  if (!shopId) throw new ShopeeApiError('getShopDetail cần shopId');
  return callApi('/api/v3/offer/shop', { shop_id: String(shopId) });
}

/** Spec §1.4 - chặn tạo link khi tài khoản bị khoá / chưa duyệt. */
async function getUserStatus() {
  return callApi('/api/v3/user/status');
}

/** Spec §1.3 - hồ sơ affiliate thô. */
async function getUserProfile() {
  return callApi('/api/v3/user/profile');
}

/**
 * affiliate_id để dựng link (spec §1.3). KHÔNG HARDCODE 17398210028: nó là id
 * của tài khoản đang test, và nếu một ngày nào đó đổi tài khoản affiliate thì
 * mọi link đã phát hành sẽ âm thầm quy hoa hồng về tài khoản cũ.
 *
 * Ba lớp cache: RAM (6h) → settings row (sống sót restart, mà repo này
 * auto-deploy nên restart liên tục) → API. Nếu API hỏng mà settings có giá trị
 * cũ thì DÙNG GIÁ TRỊ CŨ: affiliate_id gần như không bao giờ đổi, và một link
 * dựng bằng id hơi cũ vẫn ăn tiền, còn không dựng được link thì mất hẳn đơn.
 */
async function getAffiliateId() {
  if (process.env.SHOPEE_AFFILIATE_ID) return process.env.SHOPEE_AFFILIATE_ID;

  if (affiliateIdCache && Date.now() - affiliateIdCache.fetchedAt < AFFILIATE_ID_TTL_MS) {
    return affiliateIdCache.value;
  }

  const row = await settingsRepo.getRaw(AFFILIATE_ID_KEY).catch(() => null);
  if (row?.value && Date.now() - new Date(row.updatedAt).getTime() < AFFILIATE_ID_TTL_MS) {
    affiliateIdCache = { value: row.value, fetchedAt: new Date(row.updatedAt).getTime() };
    return row.value;
  }

  try {
    const profile = await getUserProfile();
    const id = profile?.affiliate_id == null ? null : String(profile.affiliate_id);
    if (!id) throw new ShopeeApiError('user/profile không có affiliate_id');
    affiliateIdCache = { value: id, fetchedAt: Date.now() };
    await settingsRepo.setRaw(AFFILIATE_ID_KEY, id).catch(() => {});
    return id;
  } catch (err) {
    if (row?.value) {
      console.error(`[shopee-api] không làm mới được affiliate_id (${err.message}), dùng giá trị đã lưu.`);
      affiliateIdCache = { value: row.value, fetchedAt: Date.now() };
      return row.value;
    }
    throw err;
  }
}

/**
 * Ảnh chụp trạng thái, KHÔNG chạm mạng trừ khi probe=true. Phục vụ
 * GET /admin/shopee-api/health và lib/healthCheck.js: SessionExpiredError là
 * tín hiệu sớm và chính xác hơn nhiều so với cách phát hiện hiện nay ("bị đá về
 * /passport" lúc scrape), nên nó phải nhìn thấy được từ dashboard.
 */
async function getApiHealth({ probe = false } = {}) {
  const now = Date.now();
  const health = {
    baseUrl: BASE_URL,
    transport: activeTransport,
    forcedTransport: FORCED_TRANSPORT || null,
    minIntervalMs: MIN_INTERVAL_MS,
    blocked: blockedUntil > now,
    blockedUntil: blockedUntil > now ? new Date(blockedUntil).toISOString() : null,
    retryAfterMs: blockedUntil > now ? blockedUntil - now : 0,
    ...stats,
  };

  if (!probe) return health;

  try {
    const status = await getUserStatus();
    health.probe = {
      ok: true,
      affiliateId: status?.affiliate_id == null ? null : String(status.affiliate_id),
      accountStatus: status?.status ?? null,
      reviewStatus: status?.review_status ?? null,
    };
  } catch (err) {
    health.probe = { ok: false, error: `${err.name}: ${err.message}` };
  }
  return health;
}

/**
 * Cho admin: đóng cầu dao ngay thay vì đợi hết 30 phút, và hạ transport về
 * mức đã cấu hình. Dùng khi đã biết nguyên nhân bị chặn và đã xử lý xong -
 * gọi bừa cái này chỉ để "thử lại cho nhanh" là cách tự làm mình bị chặn nặng.
 */
function resetBreaker() {
  blockedUntil = 0;
  activeTransport = FORCED_TRANSPORT === 'page' ? 'page' : 'request';
  return getApiHealth();
}

async function shutdown() {
  if (apiPage && !apiPage.isClosed()) await apiPage.close().catch(() => {});
  apiPage = null;
}

module.exports = {
  ShopeeApiError,
  SessionExpiredError,
  BlockedError,
  searchShopsByKeyword,
  getShopDetail,
  getUserStatus,
  getUserProfile,
  getAffiliateId,
  getApiHealth,
  resetBreaker,
  shutdown,
  // Lộ ra cho test; đường chính là các hàm có tên ở trên.
  classify,
  buildUrl,
};
