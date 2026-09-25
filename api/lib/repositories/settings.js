const prisma = require('../prisma');

const DEFAULT_COMMISSION_PCT = 70;
const COMMISSION_PCT_KEY = 'commission_pct';
// Optional one-off bonus credited to the referrer when the invitee's first
// order completes. Off by default since the programme moved to a percentage
// of every order (see referral_commission_pct below); admins can re-enable
// it as a "welcome" extra on top.
const DEFAULT_REFERRAL_REWARD = 0;
const REFERRAL_REWARD_KEY = 'referral_reward_amount';
// Referrer's share of the cashback (orders.user_commission) on each Completed
// order the invitee places. Paid from the operator's cut, never deducted from
// the invitee. 15% of a 70% cashback costs the operator 10.5 points of the
// Shopee commission, leaving ~19.5% - see lib/repositories/referralCommissions.js.
const DEFAULT_REFERRAL_COMMISSION_PCT = 15;
const REFERRAL_COMMISSION_PCT_KEY = 'referral_commission_pct';
// How many months after the invitee registers their orders keep earning the
// referrer a cut. 0 = no limit (lifetime).
const DEFAULT_REFERRAL_COMMISSION_MONTHS = 0;
const REFERRAL_COMMISSION_MONTHS_KEY = 'referral_commission_months';
// Falls back to the same default as productOfferScraper.js's own
// PRODUCT_OFFER_MAX_PAGES env var when nothing's been configured here yet.
const DEFAULT_PRODUCT_OFFER_MAX_PAGES = parseInt(process.env.PRODUCT_OFFER_MAX_PAGES || '3', 10);
const PRODUCT_OFFER_MAX_PAGES_KEY = 'product_offer_max_pages';
// Smallest withdrawal a user may request, in VND. Used by the HTTP route, by
// worker/withdrawalWorker.js as a backstop, and surfaced to the app through
// GET /app/wallet and GET /app/config.
const DEFAULT_MIN_WITHDRAW_AMOUNT = 50000;
const MIN_WITHDRAW_AMOUNT_KEY = 'min_withdraw_amount';
// Kill switch for the shop-name resolution cron (lib/shopResolution.js), read
// fresh on every tick so it can be flipped from the dashboard without a
// redeploy. Ships OFF: the job talks to Shopee's own API, and it should only
// start running once someone has eyeballed a manual batch.
const DEFAULT_SHOP_RESOLVE_ENABLED = 0;
const SHOP_RESOLVE_ENABLED_KEY = 'shop_resolve_enabled';
// Falls back to the same env var lib/shopResolution.js uses, so configuring
// either one alone still behaves sensibly.
const DEFAULT_SHOP_RESOLVE_BATCH_SIZE = parseInt(process.env.SHOP_RESOLVE_BATCH_SIZE || '10', 10);
const SHOP_RESOLVE_BATCH_SIZE_KEY = 'shop_resolve_batch_size';
// Kill switch for the nightly per-shop crawl (lib/shopProductSyncJob.js), read
// fresh on every tick for the same reason as shop_resolve_enabled. Ships OFF:
// this one drives a real browser for ten-plus minutes on a 2-core VPS, so it
// only starts running once a manual sweep has been checked by hand.
const DEFAULT_SHOP_CRAWL_ENABLED = 0;
const SHOP_CRAWL_ENABLED_KEY = 'shop_crawl_enabled';
// Both fall back to the env vars the job itself reads, so setting either one
// alone still behaves sensibly.
const DEFAULT_SHOP_CRAWL_MAX_SHOPS = parseInt(process.env.SHOP_CRAWL_MAX_SHOPS || '8', 10);
const SHOP_CRAWL_MAX_SHOPS_KEY = 'shop_crawl_max_shops';
const DEFAULT_SHOP_CRAWL_MAX_PAGES = parseInt(process.env.SHOP_CRAWL_MAX_PAGES || '5', 10);
const SHOP_CRAWL_MAX_PAGES_KEY = 'shop_crawl_max_pages';
// Kill switch for shop detail enrichment (lib/shopDetailEnrichment.js). Ships
// OFF like the other two Shopee-facing jobs: it calls Shopee's own API, and the
// spec (§8) warns that endpoint could be locked down at any time, so it starts
// only once a manual batch has been eyeballed.
//
// The addlivetag-only jobs (category backfill, shop-link backfill) deliberately
// have NO switch - they never touch Shopee, so there is nothing to protect.
const DEFAULT_SHOP_DETAIL_ENABLED = 0;
const SHOP_DETAIL_ENABLED_KEY = 'shop_detail_enabled';
const DEFAULT_SHOP_DETAIL_BATCH_SIZE = parseInt(process.env.SHOP_DETAIL_BATCH_SIZE || '20', 10);
const SHOP_DETAIL_BATCH_SIZE_KEY = 'shop_detail_batch_size';
// Which clock drives the data jobs.
//
//   continuous - lib/continuousJobs.js runs them back to back, pausing only for
//                the gaps below. Every cron for those jobs turns into a no-op.
//   cron       - the crons drive them on their schedules and the loops idle.
//
// Ships 'continuous' because right now there are no users on the app or the
// site: the whole VPS exists to finish the catalogue. Flipping it to 'cron'
// from the dashboard is the switch back to scheduled mode once traffic starts -
// both modes stay wired at all times, and neither needs a redeploy.
const DEFAULT_JOB_MODE = String(process.env.JOB_MODE || 'continuous').toLowerCase() === 'cron' ? 'cron' : 'continuous';
const JOB_MODE_KEY = 'job_mode';
// Pauses between two cycles of the same continuous loop, in seconds.
//
// `source` covers the two jobs that only ever call addlivetag - our own free
// upstream - so its gap is about being tidy, not about protection.
// `shopee` covers the jobs that call Shopee's affiliate API; its gap is real
// protection for the affiliate account and stacks on top of the client's own
// 1.2s global gate.
// `crawl` covers the browser sweep; its gap lets the shared Chromium settle
// between sweeps on a 2-core box.
// `idle` is what every loop waits when there was nothing left to do - the
// difference between "keep working" and "keep checking".
const DEFAULT_CONTINUOUS_SOURCE_GAP_SEC = parseInt(process.env.CONTINUOUS_SOURCE_GAP_SEC || '2', 10);
const CONTINUOUS_SOURCE_GAP_SEC_KEY = 'continuous_source_gap_sec';
const DEFAULT_CONTINUOUS_SHOPEE_GAP_SEC = parseInt(process.env.CONTINUOUS_SHOPEE_GAP_SEC || '10', 10);
const CONTINUOUS_SHOPEE_GAP_SEC_KEY = 'continuous_shopee_gap_sec';
const DEFAULT_CONTINUOUS_CRAWL_GAP_SEC = parseInt(process.env.CONTINUOUS_CRAWL_GAP_SEC || '30', 10);
const CONTINUOUS_CRAWL_GAP_SEC_KEY = 'continuous_crawl_gap_sec';
const DEFAULT_CONTINUOUS_IDLE_GAP_SEC = parseInt(process.env.CONTINUOUS_IDLE_GAP_SEC || '300', 10);
const CONTINUOUS_IDLE_GAP_SEC_KEY = 'continuous_idle_gap_sec';
// Share of newly minted affiliate links that go through Shopee's documented
// an_redir redirector (lib/anRedirLink.js) instead of the Playwright "Lấy
// link" page. 0 = every link on the old path, 100 = all of them.
//
// A setting rather than an env var because this is the dial you want to
// reach for at the worst moment: if an_redir links turn out not to be
// attributed, every minute at the old number is money lost, and an env var
// costs a redeploy to change. Ships at whatever SHOPEE_AN_REDIR_PERCENT
// says (0 unless set), so an untouched dashboard changes nothing.
const DEFAULT_AN_REDIR_PERCENT = parseInt(process.env.SHOPEE_AN_REDIR_PERCENT || '0', 10);
const AN_REDIR_PERCENT_KEY = 'an_redir_percent';

async function getNumber(key, fallback) {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? Number(row.value) : fallback;
}

async function setNumber(key, value) {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) },
  });
}

// Generic string accessors for values that aren't numeric knobs. `getRaw`
// returns the whole row on purpose: callers that cache with a TTL (e.g.
// lib/shopeeAffiliateApi.js's affiliate id) need `updatedAt` to know how stale
// the stored value is, and re-deriving that from a second query would race.
async function getRaw(key) {
  return prisma.setting.findUnique({ where: { key } });
}

async function setRaw(key, value) {
  return prisma.setting.upsert({
    where: { key },
    create: { key, value: String(value) },
    update: { value: String(value) },
  });
}

async function getCommissionPct() {
  return getNumber(COMMISSION_PCT_KEY, DEFAULT_COMMISSION_PCT);
}

async function setCommissionPct(pct) {
  await setNumber(COMMISSION_PCT_KEY, pct);
  return getCommissionPct();
}

// VND amount credited to the referrer once their invited friend's first
// order qualifies (see lib/repositories/referrals.js qualifyIfEligible).
async function getReferralReward() {
  return getNumber(REFERRAL_REWARD_KEY, DEFAULT_REFERRAL_REWARD);
}

async function setReferralReward(amount) {
  await setNumber(REFERRAL_REWARD_KEY, amount);
  return getReferralReward();
}

async function getReferralCommissionPct() {
  return getNumber(REFERRAL_COMMISSION_PCT_KEY, DEFAULT_REFERRAL_COMMISSION_PCT);
}

async function setReferralCommissionPct(pct) {
  await setNumber(REFERRAL_COMMISSION_PCT_KEY, pct);
  return getReferralCommissionPct();
}

async function getReferralCommissionMonths() {
  return getNumber(REFERRAL_COMMISSION_MONTHS_KEY, DEFAULT_REFERRAL_COMMISSION_MONTHS);
}

async function setReferralCommissionMonths(months) {
  await setNumber(REFERRAL_COMMISSION_MONTHS_KEY, months);
  return getReferralCommissionMonths();
}

async function getProductOfferMaxPages() {
  return getNumber(PRODUCT_OFFER_MAX_PAGES_KEY, DEFAULT_PRODUCT_OFFER_MAX_PAGES);
}

async function setProductOfferMaxPages(pages) {
  await setNumber(PRODUCT_OFFER_MAX_PAGES_KEY, pages);
  return getProductOfferMaxPages();
}

async function getMinWithdrawAmount() {
  const value = await getNumber(MIN_WITHDRAW_AMOUNT_KEY, DEFAULT_MIN_WITHDRAW_AMOUNT);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MIN_WITHDRAW_AMOUNT;
}

async function setMinWithdrawAmount(amount) {
  await setNumber(MIN_WITHDRAW_AMOUNT_KEY, amount);
  return getMinWithdrawAmount();
}

async function getShopResolveEnabled() {
  const value = await getNumber(SHOP_RESOLVE_ENABLED_KEY, DEFAULT_SHOP_RESOLVE_ENABLED);
  return Number(value) === 1;
}

async function setShopResolveEnabled(enabled) {
  await setNumber(SHOP_RESOLVE_ENABLED_KEY, enabled ? 1 : 0);
  return getShopResolveEnabled();
}

async function getShopResolveBatchSize() {
  const value = await getNumber(SHOP_RESOLVE_BATCH_SIZE_KEY, DEFAULT_SHOP_RESOLVE_BATCH_SIZE);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 50) : DEFAULT_SHOP_RESOLVE_BATCH_SIZE;
}

async function setShopResolveBatchSize(size) {
  await setNumber(SHOP_RESOLVE_BATCH_SIZE_KEY, size);
  return getShopResolveBatchSize();
}

async function getShopCrawlEnabled() {
  const value = await getNumber(SHOP_CRAWL_ENABLED_KEY, DEFAULT_SHOP_CRAWL_ENABLED);
  return Number(value) === 1;
}

async function setShopCrawlEnabled(enabled) {
  await setNumber(SHOP_CRAWL_ENABLED_KEY, enabled ? 1 : 0);
  return getShopCrawlEnabled();
}

// Capped at 50 shops and 20 pages: a dashboard typo of 500 would otherwise hold
// the shared browser lock for hours and starve the daily product_offer scrape.
async function getShopCrawlMaxShops() {
  const value = await getNumber(SHOP_CRAWL_MAX_SHOPS_KEY, DEFAULT_SHOP_CRAWL_MAX_SHOPS);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 50) : DEFAULT_SHOP_CRAWL_MAX_SHOPS;
}

async function setShopCrawlMaxShops(maxShops) {
  await setNumber(SHOP_CRAWL_MAX_SHOPS_KEY, maxShops);
  return getShopCrawlMaxShops();
}

async function getShopCrawlMaxPages() {
  const value = await getNumber(SHOP_CRAWL_MAX_PAGES_KEY, DEFAULT_SHOP_CRAWL_MAX_PAGES);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 20) : DEFAULT_SHOP_CRAWL_MAX_PAGES;
}

async function setShopCrawlMaxPages(pages) {
  await setNumber(SHOP_CRAWL_MAX_PAGES_KEY, pages);
  return getShopCrawlMaxPages();
}

async function getShopDetailEnabled() {
  const value = await getNumber(SHOP_DETAIL_ENABLED_KEY, DEFAULT_SHOP_DETAIL_ENABLED);
  return Number(value) === 1;
}

async function setShopDetailEnabled(enabled) {
  await setNumber(SHOP_DETAIL_ENABLED_KEY, enabled ? 1 : 0);
  return getShopDetailEnabled();
}

// Capped at 60: this one spends Shopee calls, and the whole point of the job is
// to trickle. A dashboard typo of 600 would empty the rate budget in a tick.
async function getShopDetailBatchSize() {
  const value = await getNumber(SHOP_DETAIL_BATCH_SIZE_KEY, DEFAULT_SHOP_DETAIL_BATCH_SIZE);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 60) : DEFAULT_SHOP_DETAIL_BATCH_SIZE;
}

async function setShopDetailBatchSize(size) {
  await setNumber(SHOP_DETAIL_BATCH_SIZE_KEY, size);
  return getShopDetailBatchSize();
}

const JOB_MODES = ['continuous', 'cron'];

async function getJobMode() {
  const row = await getRaw(JOB_MODE_KEY);
  const value = row ? String(row.value).trim().toLowerCase() : '';
  return JOB_MODES.includes(value) ? value : DEFAULT_JOB_MODE;
}

async function setJobMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (!JOB_MODES.includes(value)) throw new Error(`invalid job mode: ${mode}`);
  await setRaw(JOB_MODE_KEY, value);
  return getJobMode();
}

// Clamped to an hour: a gap longer than that is not "slower", it is off, and
// the honest way to turn a loop off is its own kill switch. 0 is allowed for
// the addlivetag loop - nothing upstream needs protecting from it.
function clampGap(value, fallback, { min = 0, max = 3600 } = {}) {
  if (!Number.isFinite(value) || value < min) return fallback;
  return Math.min(value, max);
}

async function getAnRedirPercent() {
  const value = await getNumber(AN_REDIR_PERCENT_KEY, DEFAULT_AN_REDIR_PERCENT);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

async function setAnRedirPercent(percent) {
  await setNumber(AN_REDIR_PERCENT_KEY, percent);
  return getAnRedirPercent();
}

async function getContinuousGaps() {
  const [source, shopee, crawl, idle] = await Promise.all([
    getNumber(CONTINUOUS_SOURCE_GAP_SEC_KEY, DEFAULT_CONTINUOUS_SOURCE_GAP_SEC),
    getNumber(CONTINUOUS_SHOPEE_GAP_SEC_KEY, DEFAULT_CONTINUOUS_SHOPEE_GAP_SEC),
    getNumber(CONTINUOUS_CRAWL_GAP_SEC_KEY, DEFAULT_CONTINUOUS_CRAWL_GAP_SEC),
    getNumber(CONTINUOUS_IDLE_GAP_SEC_KEY, DEFAULT_CONTINUOUS_IDLE_GAP_SEC),
  ]);
  return {
    sourceSec: clampGap(Number(source), DEFAULT_CONTINUOUS_SOURCE_GAP_SEC),
    shopeeSec: clampGap(Number(shopee), DEFAULT_CONTINUOUS_SHOPEE_GAP_SEC, { min: 1 }),
    crawlSec: clampGap(Number(crawl), DEFAULT_CONTINUOUS_CRAWL_GAP_SEC, { min: 1 }),
    // Never below 30s: the idle gap is how often an empty loop wakes up to ask
    // the database whether there is work, and that question is not free.
    idleSec: clampGap(Number(idle), DEFAULT_CONTINUOUS_IDLE_GAP_SEC, { min: 30, max: 86400 }),
  };
}

async function setContinuousGaps({ sourceSec, shopeeSec, crawlSec, idleSec } = {}) {
  if (sourceSec !== undefined) await setNumber(CONTINUOUS_SOURCE_GAP_SEC_KEY, sourceSec);
  if (shopeeSec !== undefined) await setNumber(CONTINUOUS_SHOPEE_GAP_SEC_KEY, shopeeSec);
  if (crawlSec !== undefined) await setNumber(CONTINUOUS_CRAWL_GAP_SEC_KEY, crawlSec);
  if (idleSec !== undefined) await setNumber(CONTINUOUS_IDLE_GAP_SEC_KEY, idleSec);
  return getContinuousGaps();
}

module.exports = {
  getRaw,
  setRaw,
  getCommissionPct,
  setCommissionPct,
  DEFAULT_COMMISSION_PCT,
  getReferralReward,
  setReferralReward,
  DEFAULT_REFERRAL_REWARD,
  getReferralCommissionPct,
  setReferralCommissionPct,
  DEFAULT_REFERRAL_COMMISSION_PCT,
  getReferralCommissionMonths,
  setReferralCommissionMonths,
  DEFAULT_REFERRAL_COMMISSION_MONTHS,
  getProductOfferMaxPages,
  setProductOfferMaxPages,
  DEFAULT_PRODUCT_OFFER_MAX_PAGES,
  getMinWithdrawAmount,
  setMinWithdrawAmount,
  DEFAULT_MIN_WITHDRAW_AMOUNT,
  MIN_WITHDRAW_AMOUNT_KEY,
  getShopResolveEnabled,
  setShopResolveEnabled,
  DEFAULT_SHOP_RESOLVE_ENABLED,
  SHOP_RESOLVE_ENABLED_KEY,
  getShopResolveBatchSize,
  setShopResolveBatchSize,
  DEFAULT_SHOP_RESOLVE_BATCH_SIZE,
  SHOP_RESOLVE_BATCH_SIZE_KEY,
  getShopCrawlEnabled,
  setShopCrawlEnabled,
  DEFAULT_SHOP_CRAWL_ENABLED,
  SHOP_CRAWL_ENABLED_KEY,
  getShopCrawlMaxShops,
  setShopCrawlMaxShops,
  DEFAULT_SHOP_CRAWL_MAX_SHOPS,
  SHOP_CRAWL_MAX_SHOPS_KEY,
  getShopCrawlMaxPages,
  setShopCrawlMaxPages,
  getShopDetailEnabled,
  setShopDetailEnabled,
  getShopDetailBatchSize,
  setShopDetailBatchSize,
  DEFAULT_SHOP_DETAIL_ENABLED,
  SHOP_DETAIL_ENABLED_KEY,
  DEFAULT_SHOP_DETAIL_BATCH_SIZE,
  SHOP_DETAIL_BATCH_SIZE_KEY,
  getJobMode,
  setJobMode,
  JOB_MODES,
  DEFAULT_JOB_MODE,
  JOB_MODE_KEY,
  getContinuousGaps,
  setContinuousGaps,
  getAnRedirPercent,
  setAnRedirPercent,
  DEFAULT_AN_REDIR_PERCENT,
  AN_REDIR_PERCENT_KEY,
  DEFAULT_SHOP_CRAWL_MAX_PAGES,
  SHOP_CRAWL_MAX_PAGES_KEY,
  COMMISSION_PCT_KEY,
  REFERRAL_REWARD_KEY,
  REFERRAL_COMMISSION_PCT_KEY,
  REFERRAL_COMMISSION_MONTHS_KEY,
};
