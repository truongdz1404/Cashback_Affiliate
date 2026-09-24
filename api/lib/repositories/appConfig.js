// Remote app config for the Rewally mobile app.
//
// Everything the app used to hardcode (marketing copy, cashback-rate labels,
// platform lists, SLA wording, limits, feature switches, support links) lives
// here so it can be edited in the admin dashboard and picked up by installed
// apps without shipping a new build.
//
// Shape on the wire (GET /app/config):
//   { version: "2026-09-23T10:00:00.000Z", updatedAt: <same>, config: {...} }
//
// The app caches that document and calls GET /app/config/version first; when
// the returned version equals the cached one it skips the download entirely.
// `version` is the newest `updated_at` across every settings row that feeds
// this document, so any admin edit bumps it automatically.
const prisma = require('../prisma');
const settingsRepo = require('./settings');

const APP_CONFIG_KEY = 'app_config';

// Editing any of these bumps the config version the app compares against.
const VERSIONED_KEYS = [
  APP_CONFIG_KEY,
  settingsRepo.COMMISSION_PCT_KEY,
  settingsRepo.REFERRAL_REWARD_KEY,
  settingsRepo.REFERRAL_COMMISSION_PCT_KEY,
  settingsRepo.REFERRAL_COMMISSION_MONTHS_KEY,
  settingsRepo.MIN_WITHDRAW_AMOUNT_KEY,
];

// Defaults mirror exactly what the app has baked into its own bundle today, so
// a device that never reaches the server behaves the same as one that does.
const DEFAULTS = {
  support: {
    email: 'tro247.company@gmail.com',
    hotline: '',
    zaloUrl: '',
    facebookUrl: '',
    websiteUrl: 'https://refundmoney.tro247.online',
  },
  legal: {
    // Relative paths are resolved against the app's API base URL; absolute
    // http(s) URLs are used as-is.
    privacyUrl: '/legal/privacy',
    dataDeletionUrl: '/legal/data-deletion',
    termsUrl: '',
  },
  store: {
    androidUrl: 'https://play.google.com/store/apps/details?id=com.dreek.rewally',
    iosUrl: '',
    // Web landing page used as the https fallback in the invite share message,
    // so a friend without the app installed still lands somewhere useful.
    inviteBaseUrl: '',
  },
  appUpdate: {
    // Semver of the newest published build. Empty disables the whole check.
    latestVersion: '',
    // Anything below this is blocked with a mandatory update screen.
    minSupportedVersion: '',
    // true = also block versions between min and latest (hard update).
    forceUpdate: false,
    title: 'Đã có phiên bản mới',
    message: 'Vui lòng cập nhật Rewally để tiếp tục sử dụng đầy đủ tính năng.',
  },
  maintenance: {
    enabled: false,
    title: 'Hệ thống đang bảo trì',
    message: 'Rewally đang được nâng cấp. Bạn vui lòng quay lại sau ít phút nhé.',
  },
  features: {
    shoppingTab: true,
    campaignsTab: true,
    ordersTab: false,
    walletTab: false,
    createLink: true,
    referral: true,
    withdraw: true,
    socialLogin: true,
    // Every shop surface at once: the Home rail, the shop card above search
    // results, the storefront button on a product card and the shop screen.
    // Named `shops` rather than `shopsTab` because there is deliberately no
    // shops tab and no "all shops" screen - shops are only ever reached from
    // the Home rail, a search, or a product.
    //
    // Ships OFF: a build can go to the store before the crawl has linked any
    // products to shops, and the rail/search card would otherwise be empty.
    // Turned on from the dashboard once the data is there, no re-release.
    shops: false,
  },
  home: {
    bannerAutoplayMs: 4000,
    // Now a PAGE size, not a total: the Home tab scrolls suggestions endlessly
    // in a two-column grid, so this is how many arrive per fetch. Ten rows.
    recommendationsLimit: 20,
    taskFallbackSubtitle: 'Hoàn thành nhiệm vụ để nhận thêm xu',
    platforms: [
      { name: 'Shopee', reward: 'Hoàn 10%', iconUrl: 'https://cdn.simpleicons.org/shopee/EE4D2D' },
      { name: 'Lazada', reward: 'Hoàn 10%', iconUrl: 'https://www.google.com/s2/favicons?domain=lazada.vn&sz=64' },
      { name: 'Tiki', reward: 'Hoàn 8%', iconUrl: 'https://www.google.com/s2/favicons?domain=tiki.vn&sz=64' },
      { name: 'Sendo', reward: 'Hoàn 5%', iconUrl: 'https://www.google.com/s2/favicons?domain=sendo.vn&sz=64' },
      { name: 'ShopeeFood', reward: 'Hoàn 7%', iconUrl: 'https://www.google.com/s2/favicons?domain=shopeefood.vn&sz=64' },
      { name: 'Watsons', reward: 'Hoàn 4%', iconUrl: 'https://www.google.com/s2/favicons?domain=watsons.vn&sz=64' },
    ],
  },
  link: {
    platforms: [
      { key: 'shopee', label: 'Shopee', logoUri: 'https://cdn.simpleicons.org/shopee/EE4D2D', enabled: true, brandColor: '#EE4D2D', soft: '#FFF0EC' },
      { key: 'tiktok', label: 'TikTok Shop', logoUri: 'https://cdn.simpleicons.org/tiktok/000000', enabled: false, brandColor: '#000000', soft: '#F2F2F3' },
    ],
    comingSoon: ['ShopeeFood', 'Lazada', 'Tiki', 'CellphoneS'],
  },
  shopping: {
    pricePresets: [
      { label: '0-100k', min: '0', max: '100' },
      { label: '100k-200k', min: '100', max: '200' },
      { label: '200k-300k', min: '200', max: '300' },
      { label: '300k-500k', min: '300', max: '500' },
      { label: 'Trên 500k', min: '500', max: '' },
    ],
    commissionPctPresets: ['3', '5', '10', '15'],
    emptyMessage: 'Danh sách sản phẩm hoàn tiền sẽ được cập nhật hằng ngày. Quay lại sau nhé!',
    // Bumping this re-shows the how-it-works modal to users who already
    // dismissed it, so updated SLA wording actually reaches them.
    guideVersion: 1,
    guideTitle: 'Mua sắm hoàn tiền thế nào?',
    guideSteps: [
      { icon: 'cart-outline', title: 'Bấm vào sản phẩm', description: 'Ứng dụng sẽ chuyển bạn sang Shopee. Hãy đặt hàng ngay trong phiên vừa mở để đơn được ghi nhận hoàn tiền.' },
      { icon: 'time-outline', title: 'Sau khoảng 6 giờ', description: 'Đơn hàng được cập nhật vào mục Đơn hàng của ứng dụng, kèm số tiền hoàn dự kiến.' },
      { icon: 'cube-outline', title: 'Khi đơn giao thành công', description: 'Đơn chuyển sang trạng thái chờ đối soát với Shopee.' },
      { icon: 'wallet-outline', title: '7 ngày sau đó', description: 'Tiền hoàn được cộng vào ví của bạn và có thể rút về tài khoản ngân hàng.' },
    ],
  },
  guide: {
    steps: [
      { icon: 'bag-handle-outline', title: 'Quy Trình Mua Sắm', description: 'Bạn chọn sản phẩm trên sàn thương mại điện tử, sau đó sao chép link sản phẩm.' },
      { icon: 'cart-outline', title: 'Chọn Nền Tảng', description: 'Mở Hoàn tiền, chọn sàn TMĐT phù hợp và dán link sản phẩm cần tạo.' },
      { icon: 'link-outline', title: 'Dán Link Sản Phẩm', description: 'Link hợp lệ sẽ được kiểm tra tự động, app sẽ tạo link hoàn tiền mới cho bạn.' },
      { icon: 'sparkles-outline', title: 'Lấy Link Ưu Đãi', description: 'Mở link mới để mua sắm. Hoa hồng sẽ được ghi nhận khi đơn hàng hoàn tất.' },
      { icon: 'checkmark-done-outline', title: 'Mua Hàng & Nhận Ưu Đãi', description: 'Theo dõi đơn hàng trong tab Đơn hàng và nhận thanh toán khi ví đủ điều kiện.' },
    ],
    faqs: [
      { question: 'Làm thế nào để biết đơn hàng đã lên?', answer: 'Đơn hàng thường xuất hiện sau khi sàn xác nhận giao dịch hợp lệ qua link hoàn tiền.' },
      { question: 'Khi nào tôi nhận được ưu đãi?', answer: 'Tiền hoàn được cộng vào ví sau khi đơn hoàn tất và qua bước đối soát.' },
      { question: 'Tôi có thể tạo link ở sàn nào?', answer: 'Hiện tại Shopee đã sẵn sàng. Các nền tảng khác sẽ được mở dần trong các bản cập nhật.' },
    ],
  },
  referral: {
    // {code} and {link} are replaced by the app before sharing.
    shareMessage:
      'Mua Shopee qua Rewally được hoàn tiền về tài khoản mỗi đơn đó! Đăng ký với mã giới thiệu {code} của mình nhé.{bonus}\n{link}',
    // Appended in place of {bonus} only when a first-order bonus is active.
    shareBonusSuffix: ' Cả hai mình đều có lợi.',
  },
  validation: {
    passwordMinLength: 6,
    otpLength: 6,
    otpTtlMinutes: 10,
  },
  network: {
    requestTimeoutMs: 15000,
    // Floor between two config syncs on the device, so foregrounding the app
    // repeatedly doesn't hammer the version endpoint.
    configSyncMinIntervalMs: 5 * 60 * 1000,
    pageSize: {
      orders: 30,
      links: 20,
      campaigns: 10,
      referral: 20,
      withdrawals: 20,
      shoppingProducts: 20,
    },
  },
};

const ICON_RE = /^[a-z0-9-]{1,48}$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const SEMVER_RE = /^\d{1,4}(\.\d{1,4}){0,3}$/;

function str(value, fallback, { maxLength = 500, allowEmpty = true } = {}) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().slice(0, maxLength);
  if (!trimmed && !allowEmpty) return fallback;
  return trimmed;
}

function url(value, fallback) {
  const raw = str(value, fallback, { maxLength: 500 });
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
  return fallback;
}

function bool(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function int(value, fallback, min, max) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  if (rounded < min || rounded > max) return fallback;
  return rounded;
}

function semver(value, fallback) {
  const raw = str(value, fallback, { maxLength: 24 });
  if (!raw) return '';
  return SEMVER_RE.test(raw) ? raw : fallback;
}

// Normalizing a list never throws: bad entries are dropped, and an empty or
// missing list falls back to the default so the app is never left with nothing
// to render.
function list(value, fallback, itemFn, { maxItems = 50 } = {}) {
  if (!Array.isArray(value)) return fallback;
  const items = value.slice(0, maxItems).map(itemFn).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function normalizeHomePlatform(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = str(raw.name, '', { maxLength: 40, allowEmpty: false });
  if (!name) return null;
  return {
    name,
    reward: str(raw.reward, '', { maxLength: 40 }),
    iconUrl: url(raw.iconUrl, ''),
  };
}

function normalizeLinkPlatform(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const key = str(raw.key, '', { maxLength: 32, allowEmpty: false });
  const label = str(raw.label, '', { maxLength: 40, allowEmpty: false });
  if (!key || !label) return null;
  const brandColor = str(raw.brandColor, '#000000', { maxLength: 9 });
  const soft = str(raw.soft, '#F2F2F3', { maxLength: 9 });
  return {
    key,
    label,
    logoUri: url(raw.logoUri, ''),
    enabled: bool(raw.enabled, false),
    brandColor: COLOR_RE.test(brandColor) ? brandColor : '#000000',
    soft: COLOR_RE.test(soft) ? soft : '#F2F2F3',
  };
}

function normalizeStep(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = str(raw.title, '', { maxLength: 120, allowEmpty: false });
  if (!title) return null;
  const icon = str(raw.icon, '', { maxLength: 48 });
  return {
    // Unknown icon names would crash the icon component, so only allow the
    // ionicons-style slug shape and let the app fall back on anything else.
    icon: ICON_RE.test(icon) ? icon : 'ellipse-outline',
    title,
    description: str(raw.description, '', { maxLength: 500 }),
  };
}

function normalizeFaq(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const question = str(raw.question, '', { maxLength: 200, allowEmpty: false });
  if (!question) return null;
  return { question, answer: str(raw.answer, '', { maxLength: 1000 }) };
}

function normalizePricePreset(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const label = str(raw.label, '', { maxLength: 32, allowEmpty: false });
  if (!label) return null;
  const numeric = (value) => {
    const text = str(value, '', { maxLength: 12 });
    return /^\d{0,9}$/.test(text) ? text : '';
  };
  return { label, min: numeric(raw.min), max: numeric(raw.max) };
}

function normalizeString(raw) {
  const value = str(raw, '', { maxLength: 40, allowEmpty: false });
  return value || null;
}

function normalizePctString(raw) {
  const value = str(raw, '', { maxLength: 6, allowEmpty: false });
  return /^\d{1,3}(\.\d{1,2})?$/.test(value) ? value : null;
}

// Single validator used both when reading (defends against a hand-edited row)
// and when writing (rejects junk before it ever reaches a device).
function normalize(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULTS;
  const sec = (name) => (input[name] && typeof input[name] === 'object' ? input[name] : {});

  const support = sec('support');
  const legal = sec('legal');
  const store = sec('store');
  const appUpdate = sec('appUpdate');
  const maintenance = sec('maintenance');
  const features = sec('features');
  const home = sec('home');
  const link = sec('link');
  const shopping = sec('shopping');
  const guide = sec('guide');
  const referral = sec('referral');
  const validation = sec('validation');
  const network = sec('network');
  const pageSize = network.pageSize && typeof network.pageSize === 'object' ? network.pageSize : {};

  return {
    support: {
      email: str(support.email, d.support.email, { maxLength: 120 }),
      hotline: str(support.hotline, d.support.hotline, { maxLength: 32 }),
      zaloUrl: url(support.zaloUrl, d.support.zaloUrl),
      facebookUrl: url(support.facebookUrl, d.support.facebookUrl),
      websiteUrl: url(support.websiteUrl, d.support.websiteUrl),
    },
    legal: {
      privacyUrl: url(legal.privacyUrl, d.legal.privacyUrl),
      dataDeletionUrl: url(legal.dataDeletionUrl, d.legal.dataDeletionUrl),
      termsUrl: url(legal.termsUrl, d.legal.termsUrl),
    },
    store: {
      androidUrl: url(store.androidUrl, d.store.androidUrl),
      iosUrl: url(store.iosUrl, d.store.iosUrl),
      inviteBaseUrl: url(store.inviteBaseUrl, d.store.inviteBaseUrl),
    },
    appUpdate: {
      latestVersion: semver(appUpdate.latestVersion, d.appUpdate.latestVersion),
      minSupportedVersion: semver(appUpdate.minSupportedVersion, d.appUpdate.minSupportedVersion),
      forceUpdate: bool(appUpdate.forceUpdate, d.appUpdate.forceUpdate),
      title: str(appUpdate.title, d.appUpdate.title, { maxLength: 120, allowEmpty: false }),
      message: str(appUpdate.message, d.appUpdate.message, { maxLength: 500, allowEmpty: false }),
    },
    maintenance: {
      enabled: bool(maintenance.enabled, d.maintenance.enabled),
      title: str(maintenance.title, d.maintenance.title, { maxLength: 120, allowEmpty: false }),
      message: str(maintenance.message, d.maintenance.message, { maxLength: 500, allowEmpty: false }),
    },
    features: {
      shoppingTab: bool(features.shoppingTab, d.features.shoppingTab),
      campaignsTab: bool(features.campaignsTab, d.features.campaignsTab),
      ordersTab: bool(features.ordersTab, d.features.ordersTab),
      walletTab: bool(features.walletTab, d.features.walletTab),
      createLink: bool(features.createLink, d.features.createLink),
      referral: bool(features.referral, d.features.referral),
      withdraw: bool(features.withdraw, d.features.withdraw),
      socialLogin: bool(features.socialLogin, d.features.socialLogin),
      shops: bool(features.shops, d.features.shops),
    },
    home: {
      bannerAutoplayMs: int(home.bannerAutoplayMs, d.home.bannerAutoplayMs, 1500, 60000),
      recommendationsLimit: int(home.recommendationsLimit, d.home.recommendationsLimit, 1, 50),
      taskFallbackSubtitle: str(home.taskFallbackSubtitle, d.home.taskFallbackSubtitle, { maxLength: 160 }),
      platforms: list(home.platforms, d.home.platforms, normalizeHomePlatform, { maxItems: 20 }),
    },
    link: {
      platforms: list(link.platforms, d.link.platforms, normalizeLinkPlatform, { maxItems: 20 }),
      comingSoon: list(link.comingSoon, d.link.comingSoon, normalizeString, { maxItems: 20 }),
    },
    shopping: {
      pricePresets: list(shopping.pricePresets, d.shopping.pricePresets, normalizePricePreset, { maxItems: 12 }),
      commissionPctPresets: list(shopping.commissionPctPresets, d.shopping.commissionPctPresets, normalizePctString, { maxItems: 12 }),
      emptyMessage: str(shopping.emptyMessage, d.shopping.emptyMessage, { maxLength: 300, allowEmpty: false }),
      guideVersion: int(shopping.guideVersion, d.shopping.guideVersion, 1, 100000),
      guideTitle: str(shopping.guideTitle, d.shopping.guideTitle, { maxLength: 120, allowEmpty: false }),
      guideSteps: list(shopping.guideSteps, d.shopping.guideSteps, normalizeStep, { maxItems: 12 }),
    },
    guide: {
      steps: list(guide.steps, d.guide.steps, normalizeStep, { maxItems: 12 }),
      faqs: list(guide.faqs, d.guide.faqs, normalizeFaq, { maxItems: 20 }),
    },
    referral: {
      shareMessage: str(referral.shareMessage, d.referral.shareMessage, { maxLength: 600, allowEmpty: false }),
      shareBonusSuffix: str(referral.shareBonusSuffix, d.referral.shareBonusSuffix, { maxLength: 200 }),
    },
    validation: {
      passwordMinLength: int(validation.passwordMinLength, d.validation.passwordMinLength, 4, 64),
      otpLength: int(validation.otpLength, d.validation.otpLength, 4, 10),
      otpTtlMinutes: int(validation.otpTtlMinutes, d.validation.otpTtlMinutes, 1, 1440),
    },
    network: {
      requestTimeoutMs: int(network.requestTimeoutMs, d.network.requestTimeoutMs, 3000, 120000),
      configSyncMinIntervalMs: int(network.configSyncMinIntervalMs, d.network.configSyncMinIntervalMs, 0, 24 * 60 * 60 * 1000),
      pageSize: {
        orders: int(pageSize.orders, d.network.pageSize.orders, 5, 100),
        links: int(pageSize.links, d.network.pageSize.links, 5, 100),
        campaigns: int(pageSize.campaigns, d.network.pageSize.campaigns, 5, 100),
        referral: int(pageSize.referral, d.network.pageSize.referral, 5, 100),
        withdrawals: int(pageSize.withdrawals, d.network.pageSize.withdrawals, 5, 100),
        shoppingProducts: int(pageSize.shoppingProducts, d.network.pageSize.shoppingProducts, 5, 100),
      },
    },
  };
}

// The editable part of the document, as stored.
async function getDocument() {
  const row = await prisma.setting.findUnique({ where: { key: APP_CONFIG_KEY } });
  if (!row) return normalize({});
  try {
    return normalize(JSON.parse(row.value));
  } catch {
    // A corrupt row must never take the app down.
    return normalize({});
  }
}

async function saveDocument(raw) {
  const normalized = normalize(raw);
  const value = JSON.stringify(normalized);
  await prisma.setting.upsert({
    where: { key: APP_CONFIG_KEY },
    create: { key: APP_CONFIG_KEY, value },
    update: { value },
  });
  return normalized;
}

// Newest updated_at across every settings row the app config is derived from.
// Falls back to a fixed epoch string when nothing has ever been written, so a
// fresh install and an untouched server agree on the same version.
async function getVersion() {
  const rows = await prisma.setting.findMany({
    where: { key: { in: VERSIONED_KEYS } },
    select: { updatedAt: true },
  });
  if (rows.length === 0) return '1970-01-01T00:00:00.000Z';
  const newest = rows.reduce((max, row) => (row.updatedAt > max ? row.updatedAt : max), rows[0].updatedAt);
  return new Date(newest).toISOString();
}

// Full payload served to the app: the editable document plus the business
// numbers that already live in their own settings rows, so the app reads one
// consistent snapshot instead of stitching several endpoints together.
async function getPayload() {
  const [document, version, referralCommissionPct, referralCommissionMonths, referralFirstOrderBonus, userCommissionPct, minWithdrawAmount] =
    await Promise.all([
      getDocument(),
      getVersion(),
      settingsRepo.getReferralCommissionPct(),
      settingsRepo.getReferralCommissionMonths(),
      settingsRepo.getReferralReward(),
      settingsRepo.getCommissionPct(),
      settingsRepo.getMinWithdrawAmount(),
    ]);

  return {
    version,
    updatedAt: version,
    config: {
      ...document,
      referral: {
        ...document.referral,
        commissionPct: referralCommissionPct,
        commissionMonths: referralCommissionMonths,
        firstOrderBonus: referralFirstOrderBonus,
      },
      wallet: { minWithdrawAmount },
      cashback: { userCommissionPct },
    },
  };
}

module.exports = {
  APP_CONFIG_KEY,
  DEFAULTS,
  normalize,
  getDocument,
  saveDocument,
  getVersion,
  getPayload,
};
