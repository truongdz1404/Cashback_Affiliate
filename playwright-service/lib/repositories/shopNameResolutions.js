const prisma = require('../prisma');

// Queue + memory for mapping ShoppingProduct.shopName -> Shop.shopId.
// See the model comment in prisma/schema.prisma for why this is a real table
// instead of the "column IS NULL is the queue" pattern used elsewhere.

const NOT_FOUND_RETRY_DAYS = parseInt(process.env.SHOP_RESOLVE_NOT_FOUND_RETRY_DAYS || '30', 10);
const MAX_ATTEMPTS = parseInt(process.env.SHOP_RESOLVE_MAX_ATTEMPTS || '5', 10);

// Transient-error backoff. Deliberately steep: this is Shopee's own API, and
// hammering it is the single most likely way to lose the affiliate account.
const ERROR_BACKOFF_MS = [
  5 * 60 * 1000,
  30 * 60 * 1000,
  3 * 3600 * 1000,
  24 * 3600 * 1000,
  72 * 3600 * 1000,
];

// `attemptNumber` is 1-based: the attempt that just failed. Indexing by the
// raw attempts counter instead would skip the 5-minute rung entirely and make
// the very first transient failure (a dropped connection) wait half an hour.
function backoffFor(attemptNumber) {
  const index = Math.max(0, Math.min(attemptNumber - 1, ERROR_BACKOFF_MS.length - 1));
  return ERROR_BACKOFF_MS[index];
}

function inMs(ms) {
  return new Date(Date.now() + ms);
}

/**
 * Registers newly discovered shop names. `skipDuplicates` keeps this idempotent
 * so the discovery pass can run on every tick without disturbing rows that are
 * already resolved or parked.
 */
async function upsertPending(rows) {
  if (!rows.length) return 0;
  const { count } = await prisma.shopNameResolution.createMany({
    data: rows.map((r) => ({ shopName: r.shopName, productCount: r.productCount || 0 })),
    skipDuplicates: true,
  });
  return count;
}

// Keeps productCount fresh for rows that already exist, so the queue keeps
// ordering by real impact rather than by whatever the count was on the day the
// name was first seen.
async function refreshCounts(rows) {
  let updated = 0;
  for (const r of rows) {
    const res = await prisma.shopNameResolution.updateMany({
      where: { shopName: r.shopName, productCount: { not: r.productCount || 0 } },
      data: { productCount: r.productCount || 0 },
    });
    updated += res.count;
  }
  return updated;
}

/**
 * The batch to work next: anything pending, plus anything parked whose park has
 * expired. `ambiguous` is NEVER picked up automatically - it is waiting on a
 * human choice, and re-running the same search would just produce the same tie.
 */
async function claimBatch({ limit = 10 } = {}) {
  const now = new Date();
  return prisma.shopNameResolution.findMany({
    where: {
      status: { in: ['pending', 'not_found', 'error'] },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { productCount: 'desc' }],
    take: limit,
  });
}

async function markResolved(id, { shopId, candidatesJson }) {
  return prisma.shopNameResolution.update({
    where: { id: Number(id) },
    data: {
      status: 'resolved',
      shopId: String(shopId),
      candidatesJson: candidatesJson ?? undefined,
      lastError: null,
      lastAttemptAt: new Date(),
      nextAttemptAt: null,
      resolvedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
}

// Two shops genuinely share a display name (it happens). Parked indefinitely -
// guessing here would attach products to the wrong merchant, which is worse
// than leaving them unattached.
async function markAmbiguous(id, { candidatesJson }) {
  return prisma.shopNameResolution.update({
    where: { id: Number(id) },
    data: {
      status: 'ambiguous',
      candidatesJson: candidatesJson ?? undefined,
      lastAttemptAt: new Date(),
      nextAttemptAt: null,
      attempts: { increment: 1 },
    },
  });
}

// No exact match. Parked for 30 days rather than retried: a shop that isn't in
// the affiliate programme will never match, and asking Shopee about it every
// ten minutes forever is how accounts get blocked.
async function markNotFound(id, { candidatesJson } = {}) {
  return prisma.shopNameResolution.update({
    where: { id: Number(id) },
    data: {
      status: 'not_found',
      candidatesJson: candidatesJson ?? undefined,
      lastError: null,
      lastAttemptAt: new Date(),
      nextAttemptAt: inMs(NOT_FOUND_RETRY_DAYS * 24 * 3600 * 1000),
      attempts: { increment: 1 },
    },
  });
}

async function markError(id, { attempts = 0, error }) {
  const next = attempts + 1;
  // Give up on a name that keeps failing for non-Shopee reasons and park it
  // with the not_found crowd, so it stops consuming batch slots.
  const status = next >= MAX_ATTEMPTS ? 'not_found' : 'error';
  return prisma.shopNameResolution.update({
    where: { id: Number(id) },
    data: {
      status,
      lastError: String(error || '').slice(0, 500),
      lastAttemptAt: new Date(),
      nextAttemptAt:
        status === 'not_found'
          ? inMs(NOT_FOUND_RETRY_DAYS * 24 * 3600 * 1000)
          : inMs(backoffFor(next)),
      attempts: next,
    },
  });
}

/**
 * Anti-bot cooldown. Stays `pending` and does NOT count as an attempt - being
 * blocked says nothing about this particular name, and burning its attempt
 * budget would eventually park perfectly resolvable names.
 */
async function markRetryable(id, { cooldownMs, error }) {
  return prisma.shopNameResolution.update({
    where: { id: Number(id) },
    data: {
      status: 'pending',
      lastError: String(error || '').slice(0, 500),
      lastAttemptAt: new Date(),
      nextAttemptAt: inMs(cooldownMs),
    },
  });
}

async function getById(id) {
  return prisma.shopNameResolution.findUnique({ where: { id: Number(id) } });
}

async function getByShopName(shopName) {
  return prisma.shopNameResolution.findUnique({ where: { shopName } });
}

async function listForAdmin({ status, search, limit = 50, offset = 0 } = {}) {
  const where = {};
  if (status) where.status = status;
  if (search && search.trim()) where.shopName = { contains: search.trim(), mode: 'insensitive' };
  const [items, total] = await Promise.all([
    prisma.shopNameResolution.findMany({
      where,
      orderBy: [{ productCount: 'desc' }, { id: 'asc' }],
      take: limit,
      skip: offset,
    }),
    prisma.shopNameResolution.count({ where }),
  ]);
  return { items, total };
}

async function countByStatus() {
  const rows = await prisma.shopNameResolution.groupBy({ by: ['status'], _count: { status: true } });
  return rows.reduce((acc, r) => ({ ...acc, [r.status]: r._count.status }), {});
}

module.exports = {
  NOT_FOUND_RETRY_DAYS,
  MAX_ATTEMPTS,
  upsertPending,
  refreshCounts,
  claimBatch,
  markResolved,
  markAmbiguous,
  markNotFound,
  markError,
  markRetryable,
  getById,
  getByShopName,
  listForAdmin,
  countByStatus,
};
