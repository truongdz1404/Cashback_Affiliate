const db = require('../db');
const { toCamel, toCamelList } = require('../camelize');
const settingsRepo = require('./settings');

// Called right after a new app user registers with a valid referral code
// (see server.js POST /app/register). referred_user_id is UNIQUE so a user
// can only ever be referred once, matching users.referred_by_user_id also
// only being settable at registration time.
function create(referrerUserId, referredUserId) {
  const rewardAmount = settingsRepo.getReferralReward();
  const result = db
    .prepare(
      `INSERT INTO referrals (referrer_user_id, referred_user_id, reward_amount)
       VALUES (?, ?, ?)`
    )
    .run(referrerUserId, referredUserId, rewardAmount);
  return toCamel(db.prepare('SELECT * FROM referrals WHERE id = ?').get(result.lastInsertRowid));
}

function findByReferredUser(referredUserId) {
  const row = db.prepare('SELECT * FROM referrals WHERE referred_user_id = ?').get(referredUserId);
  return row ? toCamel(row) : null;
}

// Called from lib/reconciliation.js right after an order upserts as
// Completed. Moves a still-pending referral to 'qualified' the first time
// the referred user completes any order - only fires once since the second
// call finds status already 'qualified' and no-ops.
function qualifyIfEligible(referredUserId) {
  const referral = db
    .prepare("SELECT * FROM referrals WHERE referred_user_id = ? AND status = 'pending'")
    .get(referredUserId);
  if (!referral) return null;

  db.prepare(
    "UPDATE referrals SET status = 'qualified', qualified_at = datetime('now') WHERE id = ?"
  ).run(referral.id);
  return toCamel(db.prepare('SELECT * FROM referrals WHERE id = ?').get(referral.id));
}

function listForReferrer(referrerUserId) {
  return toCamelList(
    db
      .prepare(
        `SELECT r.*, u.phone AS referredPhone
         FROM referrals r JOIN users u ON u.id = r.referred_user_id
         WHERE r.referrer_user_id = ? ORDER BY r.id DESC`
      )
      .all(referrerUserId)
  );
}

function statsForReferrer(referrerUserId) {
  return db
    .prepare(
      `SELECT
         COUNT(*) AS totalInvited,
         COUNT(*) FILTER (WHERE status = 'qualified' OR status = 'rewarded') AS qualified,
         COALESCE(SUM(reward_amount) FILTER (WHERE status = 'qualified' OR status = 'rewarded'), 0) AS totalReward
       FROM referrals WHERE referrer_user_id = ?`
    )
    .get(referrerUserId);
}

module.exports = {
  create,
  findByReferredUser,
  qualifyIfEligible,
  listForReferrer,
  statsForReferrer,
};
