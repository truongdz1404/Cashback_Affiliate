const db = require('../db');

const DEFAULT_COMMISSION_PCT = 70;
const COMMISSION_PCT_KEY = 'commission_pct';
const DEFAULT_REFERRAL_REWARD = 10000;
const REFERRAL_REWARD_KEY = 'referral_reward_amount';

function getCommissionPct() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(COMMISSION_PCT_KEY);
  return row ? Number(row.value) : DEFAULT_COMMISSION_PCT;
}

function setCommissionPct(pct) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(COMMISSION_PCT_KEY, String(pct));
  return getCommissionPct();
}

// VND amount credited to the referrer once their invited friend's first
// order qualifies (see lib/repositories/referrals.js qualifyIfEligible).
function getReferralReward() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(REFERRAL_REWARD_KEY);
  return row ? Number(row.value) : DEFAULT_REFERRAL_REWARD;
}

function setReferralReward(amount) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(REFERRAL_REWARD_KEY, String(amount));
  return getReferralReward();
}

module.exports = {
  getCommissionPct,
  setCommissionPct,
  DEFAULT_COMMISSION_PCT,
  getReferralReward,
  setReferralReward,
  DEFAULT_REFERRAL_REWARD,
};
