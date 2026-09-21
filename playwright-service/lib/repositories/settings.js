const prisma = require('../prisma');

const DEFAULT_COMMISSION_PCT = 70;
const COMMISSION_PCT_KEY = 'commission_pct';
const DEFAULT_REFERRAL_REWARD = 10000;
const REFERRAL_REWARD_KEY = 'referral_reward_amount';
// Falls back to the same default as productOfferScraper.js's own
// PRODUCT_OFFER_MAX_PAGES env var when nothing's been configured here yet.
const DEFAULT_PRODUCT_OFFER_MAX_PAGES = parseInt(process.env.PRODUCT_OFFER_MAX_PAGES || '3', 10);
const PRODUCT_OFFER_MAX_PAGES_KEY = 'product_offer_max_pages';

async function getCommissionPct() {
  const row = await prisma.setting.findUnique({ where: { key: COMMISSION_PCT_KEY } });
  return row ? Number(row.value) : DEFAULT_COMMISSION_PCT;
}

async function setCommissionPct(pct) {
  await prisma.setting.upsert({
    where: { key: COMMISSION_PCT_KEY },
    create: { key: COMMISSION_PCT_KEY, value: String(pct) },
    update: { value: String(pct) },
  });
  return getCommissionPct();
}

// VND amount credited to the referrer once their invited friend's first
// order qualifies (see lib/repositories/referrals.js qualifyIfEligible).
async function getReferralReward() {
  const row = await prisma.setting.findUnique({ where: { key: REFERRAL_REWARD_KEY } });
  return row ? Number(row.value) : DEFAULT_REFERRAL_REWARD;
}

async function setReferralReward(amount) {
  await prisma.setting.upsert({
    where: { key: REFERRAL_REWARD_KEY },
    create: { key: REFERRAL_REWARD_KEY, value: String(amount) },
    update: { value: String(amount) },
  });
  return getReferralReward();
}

async function getProductOfferMaxPages() {
  const row = await prisma.setting.findUnique({ where: { key: PRODUCT_OFFER_MAX_PAGES_KEY } });
  return row ? Number(row.value) : DEFAULT_PRODUCT_OFFER_MAX_PAGES;
}

async function setProductOfferMaxPages(pages) {
  await prisma.setting.upsert({
    where: { key: PRODUCT_OFFER_MAX_PAGES_KEY },
    create: { key: PRODUCT_OFFER_MAX_PAGES_KEY, value: String(pages) },
    update: { value: String(pages) },
  });
  return getProductOfferMaxPages();
}

module.exports = {
  getCommissionPct,
  setCommissionPct,
  DEFAULT_COMMISSION_PCT,
  getReferralReward,
  setReferralReward,
  DEFAULT_REFERRAL_REWARD,
  getProductOfferMaxPages,
  setProductOfferMaxPages,
  DEFAULT_PRODUCT_OFFER_MAX_PAGES,
};
