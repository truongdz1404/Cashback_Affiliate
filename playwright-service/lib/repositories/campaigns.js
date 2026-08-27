const db = require('../db');
const { toCamel, toCamelList } = require('../camelize');

// tiers_json is a JSON array of {orders, reward}, edited as one blob from
// the admin dashboard (settings-style JSON textarea) rather than needing a
// dedicated tiers table - kept intentionally simple for v1.
function parseTiers(row) {
  if (!row) return row;
  let tiers = [];
  try {
    tiers = JSON.parse(row.tiers_json || '[]');
  } catch (err) {
    tiers = [];
  }
  return { ...row, tiers };
}

function listActive() {
  const rows = db
    .prepare(
      `SELECT * FROM campaigns
       WHERE is_active = 1
         AND (starts_at IS NULL OR starts_at <= datetime('now'))
         AND (ends_at IS NULL OR ends_at >= datetime('now'))
       ORDER BY id DESC`
    )
    .all();
  return toCamelList(rows.map(parseTiers));
}

function listAll() {
  const rows = db.prepare('SELECT * FROM campaigns ORDER BY id DESC').all();
  return toCamelList(rows.map(parseTiers));
}

function getById(id) {
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  return row ? toCamel(parseTiers(row)) : null;
}

function create({ title, description, startsAt, endsAt, tiers, isActive }) {
  const result = db
    .prepare(
      `INSERT INTO campaigns (title, description, starts_at, ends_at, tiers_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(title, description ?? null, startsAt ?? null, endsAt ?? null, JSON.stringify(tiers ?? []), isActive ? 1 : 0);
  return getById(result.lastInsertRowid);
}

function update(id, { title, description, startsAt, endsAt, tiers, isActive }) {
  const current = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!current) return null;
  db.prepare(
    `UPDATE campaigns SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       starts_at = ?,
       ends_at = ?,
       tiers_json = COALESCE(?, tiers_json),
       is_active = COALESCE(?, is_active)
     WHERE id = ?`
  ).run(
    title ?? null,
    description ?? null,
    startsAt !== undefined ? startsAt : current.starts_at,
    endsAt !== undefined ? endsAt : current.ends_at,
    tiers !== undefined ? JSON.stringify(tiers) : null,
    isActive === undefined || isActive === null ? null : isActive ? 1 : 0,
    id
  );
  return getById(id);
}

// Progress toward a campaign's tiers is computed on the fly from completed
// orders placed within the campaign's date window, rather than tracked in a
// running counter - avoids a second source of truth to keep in sync.
function countCompletedOrders(userId, campaign) {
  const conditions = ['user_id = ?', 'display_order_status = 2'];
  const params = [userId];
  if (campaign.starts_at) {
    conditions.push('purchase_time >= ?');
    params.push(campaign.starts_at);
  }
  if (campaign.ends_at) {
    conditions.push('purchase_time <= ?');
    params.push(campaign.ends_at);
  }
  return db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE ${conditions.join(' AND ')}`).get(...params).n;
}

// Called from lib/reconciliation.js right after an order upserts as
// Completed. Grants any newly-reached tier for every active campaign,
// relying on campaign_rewards' UNIQUE(campaign_id, user_id, order_threshold)
// to make this idempotent if reconciliation re-processes the same order.
function grantRewardsForUser(userId) {
  const campaigns = db.prepare("SELECT * FROM campaigns WHERE is_active = 1").all();
  const granted = [];
  for (const campaign of campaigns) {
    let tiers = [];
    try {
      tiers = JSON.parse(campaign.tiers_json || '[]');
    } catch (err) {
      continue;
    }
    const completedOrders = countCompletedOrders(userId, campaign);
    for (const tier of tiers) {
      if (completedOrders < Number(tier.orders)) continue;
      try {
        const result = db
          .prepare(
            `INSERT INTO campaign_rewards (campaign_id, user_id, order_threshold, reward_amount)
             VALUES (?, ?, ?, ?)`
          )
          .run(campaign.id, userId, tier.orders, tier.reward);
        granted.push(toCamel(db.prepare('SELECT * FROM campaign_rewards WHERE id = ?').get(result.lastInsertRowid)));
      } catch (err) {
        if (!/UNIQUE/.test(err.message)) throw err;
      }
    }
  }
  return granted;
}

function rewardsForUser(userId) {
  return toCamelList(
    db
      .prepare(
        `SELECT r.*, c.title AS campaignTitle
         FROM campaign_rewards r JOIN campaigns c ON c.id = r.campaign_id
         WHERE r.user_id = ? ORDER BY r.id DESC`
      )
      .all(userId)
  );
}

// App-facing "Su kien" tab: each active campaign plus this user's live
// progress and any tiers already reached, in one call.
function viewForUser(userId) {
  const campaigns = listActive();
  const rewards = rewardsForUser(userId);
  return campaigns.map((campaign) => ({
    ...campaign,
    completedOrders: countCompletedOrders(userId, { starts_at: campaign.startsAt, ends_at: campaign.endsAt }),
    rewardsEarned: rewards.filter((r) => r.campaignId === campaign.id),
  }));
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
