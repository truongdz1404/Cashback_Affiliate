const prisma = require('../prisma');
const settingsRepo = require('./settings');

// Called right after a new app user registers with a valid referral code
// (see server.js POST /app/register). referred_user_id is UNIQUE so a user
// can only ever be referred once, matching users.referred_by_user_id also
// only being settable at registration time.
async function create(referrerUserId, referredUserId) {
  const rewardAmount = await settingsRepo.getReferralReward();
  return prisma.referral.create({
    data: {
      referrerUserId: Number(referrerUserId),
      referredUserId: Number(referredUserId),
      rewardAmount,
    },
  });
}

async function findByReferredUser(referredUserId) {
  return prisma.referral.findUnique({ where: { referredUserId: Number(referredUserId) } });
}

// Called from lib/reconciliation.js right after an order upserts as
// Completed. Moves a still-pending referral to 'qualified' the first time
// the referred user completes any order - only fires once since the second
// call finds status already 'qualified' and no-ops.
async function qualifyIfEligible(referredUserId) {
  const referral = await prisma.referral.findFirst({
    where: { referredUserId: Number(referredUserId), status: 'pending' },
  });
  if (!referral) return null;

  return prisma.referral.update({
    where: { id: referral.id },
    data: { status: 'qualified', qualifiedAt: new Date().toISOString() },
  });
}

async function listForReferrer(referrerUserId) {
  const rows = await prisma.referral.findMany({
    where: { referrerUserId: Number(referrerUserId) },
    orderBy: { id: 'desc' },
    include: { referred: { select: { phone: true } } },
  });
  return rows.map(({ referred, ...referral }) => ({ ...referral, referredPhone: referred.phone }));
}

async function statsForReferrer(referrerUserId) {
  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*) AS "totalInvited",
      COUNT(*) FILTER (WHERE status = 'qualified' OR status = 'rewarded') AS "qualified",
      COALESCE(SUM(reward_amount) FILTER (WHERE status = 'qualified' OR status = 'rewarded'), 0) AS "totalReward"
    FROM referrals WHERE referrer_user_id = ${Number(referrerUserId)}
  `;
  const row = rows[0];
  return {
    totalInvited: Number(row.totalInvited),
    qualified: Number(row.qualified),
    totalReward: Number(row.totalReward),
  };
}

module.exports = {
  create,
  findByReferredUser,
  qualifyIfEligible,
  listForReferrer,
  statsForReferrer,
};
