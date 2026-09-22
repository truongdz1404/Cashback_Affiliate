const prisma = require('../prisma');

// One upsert per product, keyed by Shopee's own item id - keeps a re-scrape
// idempotent (same product just gets fresher price/commission text and a
// bumped scrapedAt) instead of growing the table forever.
async function upsertMany(products) {
  const scrapedAt = new Date();
  let count = 0;
  for (const p of products) {
    if (!p.productId) continue;
    await prisma.shoppingProduct.upsert({
      where: { productId: p.productId },
      create: { ...p, scrapedAt },
      update: { ...p, scrapedAt },
    });
    count++;
  }
  return count;
}

const SORTS = {
  newest: { scrapedAt: 'desc' },
  price_asc: { priceValue: 'asc' },
  price_desc: { priceValue: 'desc' },
  commission_desc: { commissionValue: 'desc' },
  commission_asc: { commissionValue: 'asc' },
};

// minCommissionRateValue/maxCommissionRateValue/minCommissionValue/maxCommissionValue
// are on Shopee's RAW commission scale (commissionRateValue/commissionValue
// columns) - the caller (server.js) is responsible for converting a user-
// facing "what I actually get" range into this raw scale via the user's
// effective commission %, since that % varies per user and isn't stored here.
function buildWhere({ search, minPrice, maxPrice, minCommissionRateValue, maxCommissionRateValue, minCommissionValue, maxCommissionValue }) {
  const where = {};
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: 'insensitive' };
  }
  if (minPrice != null || maxPrice != null) {
    where.priceValue = {};
    if (minPrice != null) where.priceValue.gte = minPrice;
    if (maxPrice != null) where.priceValue.lte = maxPrice;
  }
  if (minCommissionRateValue != null || maxCommissionRateValue != null) {
    where.commissionRateValue = {};
    if (minCommissionRateValue != null) where.commissionRateValue.gte = minCommissionRateValue;
    if (maxCommissionRateValue != null) where.commissionRateValue.lte = maxCommissionRateValue;
  }
  if (minCommissionValue != null || maxCommissionValue != null) {
    where.commissionValue = {};
    if (minCommissionValue != null) where.commissionValue.gte = minCommissionValue;
    if (maxCommissionValue != null) where.commissionValue.lte = maxCommissionValue;
  }
  return where;
}

async function list({ limit = 20, offset = 0, sort, ...filters } = {}) {
  return prisma.shoppingProduct.findMany({
    where: buildWhere(filters),
    orderBy: SORTS[sort] || SORTS.newest,
    take: limit,
    skip: offset,
  });
}

async function count(filters = {}) {
  return prisma.shoppingProduct.count({ where: buildWhere(filters) });
}

async function remove(id) {
  try {
    await prisma.shoppingProduct.delete({ where: { id: Number(id) } });
    return true;
  } catch {
    return false;
  }
}

async function getById(id) {
  return prisma.shoppingProduct.findUnique({ where: { id: Number(id) } });
}

module.exports = { upsertMany, list, count, remove, getById };
