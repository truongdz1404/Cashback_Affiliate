const { Prisma } = require('@prisma/client');
const prisma = require('../prisma');

// tiers_json is a JSON array of {amount, reward} - "reach `amount` VND of
// paid-out cashback in this campaign's window, unlock `reward`" - edited as
// one blob from the admin dashboard (settings-style JSON textarea) rather
// than needing a dedicated tiers table - kept intentionally simple for v1.
function parseTiers(row) {
  if (!row) return row;
  let tiers = [];
  try {
    tiers = JSON.parse(row.tiersJson || '[]');
  } catch (err) {
    tiers = [];
  }
  return { ...row, tiers };
}

async function listActive({ limit, offset } = {}) {
  const now = new Date().toISOString();
  const rows = await prisma.campaign.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { id: 'desc' },
    ...(limit !== undefined ? { take: limit } : {}),
    ...(offset !== undefined ? { skip: offset } : {}),
  });
  return rows.map(parseTiers);
}

async function listAll() {
  const rows = await prisma.campaign.findMany({ orderBy: { id: 'desc' } });
  return rows.map(parseTiers);
}

async function getById(id) {
  const row = await prisma.campaign.findUnique({ where: { id: Number(id) } });
  return row ? parseTiers(row) : null;
}

async function create({ title, description, startsAt, endsAt, tiers, isActive }) {
  const created = await prisma.campaign.create({
    data: {
      title,
      description: description ?? null,
      startsAt: startsAt ?? null,
      endsAt: endsAt ?? null,
      tiersJson: JSON.stringify(tiers ?? []),
      isActive: !!isActive,
    },
  });
  return getById(created.id);
}

async function update(id, { title, description, startsAt, endsAt, tiers, isActive }) {
  const current = await prisma.campaign.findUnique({ where: { id: Number(id) } });
  if (!current) return null;
  await prisma.campaign.update({
    where: { id: Number(id) },
    data: {
      title: title ?? current.title,
      description: description ?? current.description,
      startsAt: startsAt !== undefined ? startsAt : current.startsAt,
      endsAt: endsAt !== undefined ? endsAt : current.endsAt,
      tiersJson: tiers !== undefined ? JSON.stringify(tiers) : current.tiersJson,
      isActive: isActive === undefined || isActive === null ? current.isActive : !!isActive,
    },
  });
  return getById(id);
}

// campaigns.starts_at/ends_at are admin-entered date strings ("2026-09-01
// 00:00:00"), but orders.purchase_time is a TEXT column holding the Unix
// timestamp Shopee reports ("1788887584"). Comparing the two as text is a
// character-by-character comparison that says every order ever placed sorts
// before every date this decade - so a campaign with a start date matched no
// orders at all and one with only an end date matched every order in the
// table, including orders from before the campaign existed. Both ends of the
// window are converted to the epoch seconds the column actually stores.
function toEpochSeconds(value) {
  if (value === null || value === undefined || value === '') return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.floor(asNumber > 1e12 ? asNumber / 1000 : asNumber);
  }
  const text = String(value);
  const parsed = Date.parse(text.includes('T') ? text : text.replace(' ', 'T'));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

// Progress toward a campaign's tiers is computed on the fly from this user's
// paid-out commission within the campaign's date window, rather than
// tracked in a running counter - avoids a second source of truth to keep in
// sync. Only payoutStatus='paid' orders count: the milestone is meant to
// track money the user has definitely already received, not merely
// Completed-but-unpaid or still-Pending amounts (which can still be
// cancelled/reversed by Shopee).
//
// Raw SQL rather than a Prisma aggregate because the window needs the column
// cast to a number, and the CASE keeps a row with a non-numeric purchase_time
// from turning the whole query into a cast error.
async function sumPaidAmountForUser(userId, campaign, tx = prisma) {
  const startsAt = toEpochSeconds(campaign.starts_at ?? campaign.startsAt);
  const endsAt = toEpochSeconds(campaign.ends_at ?? campaign.endsAt);

  const rows = await tx.$queryRaw`
    SELECT COALESCE(SUM(user_commission), 0) AS total
    FROM orders
    WHERE user_id = ${Number(userId)}
      AND display_order_status = 2
      AND payout_status = 'paid'
      AND (
        ${startsAt}::bigint IS NULL
        OR (CASE WHEN purchase_time ~ '^[0-9]+$' THEN purchase_time::bigint END) >= ${startsAt}::bigint
      )
      AND (
        ${endsAt}::bigint IS NULL
        OR (CASE WHEN purchase_time ~ '^[0-9]+$' THEN purchase_time::bigint END) <= ${endsAt}::bigint
      )
  `;
  return Number(rows[0]?.total ?? 0);
}

// Generates an evenly-spaced tiers array to seed/preview a campaign's
// tiers_json - e.g. stepAmount=100000, rewardPerStep=10000, steps=5 gives
// "every +100k paid, +10k reward" for 5 milestones. This is the "calculation
// support" for admins defining tiers: it's just a starting point they can
// still hand-edit (bump the reward on the last tier, remove one, etc.)
// before saving via the normal create/update endpoints.
function buildStepTiers({ stepAmount, rewardPerStep, steps }) {
  const step = Number(stepAmount);
  const reward = Number(rewardPerStep);
  const count = Number(steps);
  if (!(step > 0) || !(reward > 0) || !(count > 0)) {
    throw new Error('stepAmount, rewardPerStep and steps must all be positive numbers');
  }
  return Array.from({ length: count }, (_, i) => ({ amount: step * (i + 1), reward }));
}

// Called from lib/reconciliation.js right after an order upserts as
// Completed. Grants any newly-reached tier for every active campaign,
// relying on campaign_rewards' UNIQUE(campaign_id, user_id, threshold_amount)
// to make this idempotent if reconciliation re-processes the same order.
async function grantRewardsForUser(userId, tx = prisma) {
  const campaigns = await tx.campaign.findMany({ where: { isActive: true } });
  const granted = [];
  for (const campaign of campaigns) {
    let tiers = [];
    try {
      tiers = JSON.parse(campaign.tiersJson || '[]');
    } catch (err) {
      continue;
    }
    const paidAmount = await sumPaidAmountForUser(userId, campaign, tx);
    for (const tier of tiers) {
      if (paidAmount < Number(tier.amount)) continue;
      try {
        const reward = await tx.campaignReward.create({
          data: {
            campaignId: campaign.id,
            userId: Number(userId),
            thresholdAmount: tier.amount,
            rewardAmount: tier.reward,
          },
        });
        granted.push(reward);
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
      }
    }
  }
  return granted;
}

async function unpaidTotalForUser(userId, tx = prisma) {
  const result = await tx.campaignReward.aggregate({
    where: { userId: Number(userId), payoutStatus: 'unpaid' },
    _sum: { rewardAmount: true },
  });
  return result._sum.rewardAmount ?? 0;
}

async function markRewardPaid(id) {
  return prisma.campaignReward.update({
    where: { id: Number(id) },
    data: { payoutStatus: 'paid', paidAt: new Date().toISOString() },
  });
}

// Called when one of this user's paid orders is later reported Cancelled by
// Shopee (or its payout reversed), since grantRewardsForUser's tier progress
// is computed live from paid amounts and may no longer be reached.
// Re-checks every reward already granted to this user against the current
// paid amount; unpaid rewards that no longer qualify are revoked, paid ones
// are flagged for manual review instead (money already sent can't be
// auto-reversed).
async function reevaluateRewardsForUser(userId, tx = prisma) {
  const rewards = await tx.campaignReward.findMany({
    where: { userId: Number(userId), payoutStatus: { in: ['unpaid', 'paid'] } },
    include: { campaign: true },
  });
  const flagged = [];
  for (const reward of rewards) {
    const paidAmount = await sumPaidAmountForUser(userId, reward.campaign, tx);
    if (paidAmount >= reward.thresholdAmount) continue;

    if (reward.payoutStatus === 'paid') {
      flagged.push(reward);
      continue;
    }
    await tx.campaignReward.update({ where: { id: reward.id }, data: { payoutStatus: 'revoked' } });
  }
  return flagged;
}

async function rewardsForUser(userId) {
  const rows = await prisma.campaignReward.findMany({
    where: { userId: Number(userId) },
    orderBy: { id: 'desc' },
    include: { campaign: { select: { title: true } } },
  });
  return rows.map(({ campaign, ...reward }) => ({ ...reward, campaignTitle: campaign.title }));
}

// App-facing "Su kien" tab: each active campaign plus this user's live
// progress and any tiers already reached, in one call.
async function viewForUser(userId, { limit, offset } = {}) {
  const campaigns = await listActive({ limit, offset });
  const rewards = await rewardsForUser(userId);
  const results = [];
  for (const campaign of campaigns) {
    results.push({
      ...campaign,
      paidAmount: await sumPaidAmountForUser(userId, campaign),
      rewardsEarned: rewards.filter((r) => r.campaignId === campaign.id),
    });
  }
  return results;
}

// Same payload as viewForUser() minus everything user-scoped, for the public
// website's logged-out campaign list: the tiers/dates/titles are public
// marketing info, only the progress is personal.
async function viewForAnonymous({ limit, offset } = {}) {
  const campaigns = await listActive({ limit, offset });
  return campaigns.map((campaign) => ({ ...campaign, paidAmount: 0, rewardsEarned: [] }));
}

module.exports = {
  listActive,
  listAll,
  getById,
  create,
  update,
  sumPaidAmountForUser,
  buildStepTiers,
  grantRewardsForUser,
  rewardsForUser,
  viewForUser,
  viewForAnonymous,
  unpaidTotalForUser,
  markRewardPaid,
  reevaluateRewardsForUser,
};
