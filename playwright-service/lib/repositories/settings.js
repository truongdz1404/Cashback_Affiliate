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
  COMMISSION_PCT_KEY,
  REFERRAL_REWARD_KEY,
  REFERRAL_COMMISSION_PCT_KEY,
  REFERRAL_COMMISSION_MONTHS_KEY,
};
