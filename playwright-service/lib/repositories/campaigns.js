const { Prisma } = require('@prisma/client');
const prisma = require('../prisma');

// tiers_json is a JSON array of {orders, reward}, edited as one blob from
// the admin dashboard (settings-style JSON textarea) rather than needing a
// dedicated tiers table - kept intentionally simple for v1.
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

async function listActive() {
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

// Progress toward a campaign's tiers is computed on the fly from completed
// orders placed within the campaign's date window, rather than tracked in a
// running counter - avoids a second source of truth to keep in sync.
async function countCompletedOrders(userId, campaign) {
  const where = { userId: Number(userId), displayOrderStatus: 2 };
  if (campaign.starts_at || campaign.startsAt) {
    where.purchaseTime = { ...(where.purchaseTime || {}), gte: campaign.starts_at || campaign.startsAt };
  }
  if (campaign.ends_at || campaign.endsAt) {
    where.purchaseTime = { ...(where.purchaseTime || {}), lte: campaign.ends_at || campaign.endsAt };
  }
  return prisma.order.count({ where });
}

// Called from lib/reconciliation.js right after an order upserts as
// Completed. Grants any newly-reached tier for every active campaign,
// relying on campaign_rewards' UNIQUE(campaign_id, user_id, order_threshold)
// to make this idempotent if reconciliation re-processes the same order.
async function grantRewardsForUser(userId) {
  const campaigns = await prisma.campaign.findMany({ where: { isActive: true } });
  const granted = [];
  for (const campaign of campaigns) {
    let tiers = [];
    try {
      tiers = JSON.parse(campaign.tiersJson || '[]');
    } catch (err) {
      continue;
    }
    const completedOrders = await countCompletedOrders(userId, campaign);
    for (const tier of tiers) {
      if (completedOrders < Number(tier.orders)) continue;
      try {
        const reward = await prisma.campaignReward.create({
          data: {
            campaignId: campaign.id,
            userId: Number(userId),
            orderThreshold: tier.orders,
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
async function viewForUser(userId) {
  const campaigns = await listActive();
  const rewards = await rewardsForUser(userId);
  const results = [];
  for (const campaign of campaigns) {
    results.push({
      ...campaign,
      completedOrders: await countCompletedOrders(userId, campaign),
      rewardsEarned: rewards.filter((r) => r.campaignId === campaign.id),
    });
  }
  return results;
}

module.exports = {
  listActive,
  listAll,
  getById,
  create,
  update,
  countCompletedOrders,
  grantRewardsForUser,
  rewardsForUser,
  viewForUser,
};
