const prisma = require('../prisma');
const { mapMetaToProductFields } = require('../shoppingProductMapper');
const { foldForSearch } = require('../textMatch');
// One-way: shops.js must never require this file back, or the cycle leaves one
// of the two exporting an empty object depending on which loaded first.
const shopsRepo = require('./shops');

/**
 * One upsert per product, keyed by Shopee's own item id - keeps a re-scrape
 * idempotent (same product just gets fresher price/commission text and a
 * bumped scrapedAt) instead of growing the table forever.
 *
 * `createOnly` holds fields that describe where a row was FIRST seen, and it is
 * deliberately absent from `update`. The per-shop crawler
 * (lib/shopOfferScraper.js) finds the same products the daily product_offer
 * scrape does; without this split, crawling a shop would overwrite the
 * `sourceTab` recorded when the product was scraped from "Bán chạy nhất" and
 * lose that audit trail.
 *
 * The mirror-image trap is in the caller: every key present in `p` is written
 * on update, and Prisma writes an explicit `null` (it only skips `undefined`).
 * So a mapper feeding this must leave a field out entirely rather than pass
 * null for "I don't know" - which is why mapCsvRowToProduct has no `shopId`
 * key at all, and why a normal product_offer re-scrape cannot blank the shop a
 * product was already linked to.
 */
async function upsertMany(products, { createOnly = {} } = {}) {
  const scrapedAt = new Date();
  let count = 0;
  for (const p of products) {
    if (!p.productId) continue;
    await prisma.shoppingProduct.upsert({
      where: { productId: p.productId },
      create: { ...createOnly, ...p, scrapedAt },
      update: { ...p, scrapedAt },
    });
    count++;
  }
  return count;
}

/**
 * The shop summary embedded in every product row that can reach a client.
 *
 * It has to be applied at EVERY query that feeds /app/shopping-products, not
 * just this file's list(): the RN app has a single `ShoppingProduct` type, so
 * if only the filtered branch carried `shop`, the field would silently vanish
 * the moment a response came from the recommendation ranker instead - and the
 * "view this shop" button on a card would disappear with it. The other four
 * sites are in lib/repositories/recommendations.js.
 *
 * Cost is ~120 bytes a row (~12KB on a 100-item page), against an N+1
 * /app/shops/:shopId per card if the client had to fetch it itself.
 *
 * No commission field here. The card draws the product's own cashback, and
 * the shop's rate on this object was Shopee's raw one - see toPublicProduct
 * in ../commissionSplit.js.
 */
const SHOP_INCLUDE = {
  shop: {
    select: {
      shopId: true,
      name: true,
      imageUrl: true,
      portraitUrl: true,
      isFeatured: true,
    },
  },
};

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
function buildWhere({ search, minPrice, maxPrice, minCommissionRateValue, maxCommissionRateValue, minCommissionValue, maxCommissionValue, category, isBestSeller, isXtraCommission, shopId }) {
  const where = {};
  if (search && search.trim()) {
    // Matched against the folded column, not `name`: people type "dien thoai"
    // and mean "Điện Thoại". `name_folded` is GENERATED ALWAYS AS
    // (fold_for_search(name)) in Postgres and carries its own GIN trgm index,
    // so this stays one index scan - see
    // prisma/migrations/20260925180000_add_folded_name_search.
    //
    // No `mode: 'insensitive'`: the column is already lowercased, so a plain
    // LIKE is both correct and the only form the trgm index can serve. Adding
    // it back would turn this into ILIKE and cost the index.
    const folded = foldForSearch(search);
    if (folded) where.nameFolded = { contains: folded };
  }
  if (category) where.category = category;
  // Shopee's own shop id (not shops.id) - see the FK note in schema.prisma.
  // NOTE for whoever adds a caller: server.js's /app/shopping-products only
  // reaches this builder when its `hasFilter` check is true; otherwise it hands
  // off to the recommendation ranker, which builds its own `where` and would
  // ignore shopId entirely, returning the whole catalog under one shop's name.
  if (shopId) where.shopId = String(shopId);
  // Only narrow on `true` - `false` would exclude rows scraped before these
  // pseudo-tags existed rather than meaning anything useful.
  if (isBestSeller === true) where.isBestSeller = true;
  if (isXtraCommission === true) where.isXtraCommission = true;
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
    include: SHOP_INCLUDE,
    orderBy: SORTS[sort] || SORTS.newest,
    take: limit,
    skip: offset,
  });
}

async function count(filters = {}) {
  return prisma.shoppingProduct.count({ where: buildWhere(filters) });
}

// Real Shopee taxonomy only, straight out of the `category` column - the
// column is backfilled gradually by lib/categoryEnrichment.js, so this
// legitimately returns few or no rows early on and callers must handle that
// rather than fall back to an invented taxonomy.
async function listCategories({ minCount = 1 } = {}) {
  const rows = await prisma.shoppingProduct.groupBy({
    by: ['category'],
    where: { category: { not: null } },
    _count: { category: true },
    orderBy: { _count: { category: 'desc' } },
  });
  return rows
    .filter((r) => r.category && r._count.category >= minCount)
    .map((r) => ({ category: r.category, count: r._count.category }));
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

/**
 * Creates the Shop row a new product's shopId points at, and returns the id to
 * store - or null if it couldn't be created.
 *
 * Order matters: shopping_products.shop_id is a foreign key, so writing an id
 * whose Shop row does not exist rejects the whole insert. The shop therefore has
 * to be created first, and any failure here has to fall back to null rather than
 * propagate: a catalog row with no shop is exactly the status quo, while a lost
 * catalog row is a product the user linked and can never browse again. Shop
 * attribution is recoverable later (lib/shopLinkBackfill.js sweeps rows with no
 * shop); the product row is not.
 */
async function ensureShopLink(fields) {
  if (!fields.shopId || !fields.shopName) return null;
  try {
    const shop = await shopsRepo.ensureFromProduct({ shopId: fields.shopId, name: fields.shopName });
    return shop ? shop.shopId : null;
  } catch (err) {
    console.warn('shopping-products: could not ensure shop', fields.shopId, err.message);
    return null;
  }
}

// Called fire-and-forget off POST /app/link (server.js) once a commission
// lookup already happened for a productId that isn't in the catalog yet -
// the lookup's `meta`/`commissionTable` is basically free data at that point,
// so this closes the loop between "user linked a product" and "product is
// browsable/recommendable in the Shopping tab" without a separate crawl.
// Never overwrites an existing row (addlivetag's data is cached up to 24h,
// the catalog's own scrape/backfill data is more authoritative once present).
async function ensureExists(productId, meta, commissionTable) {
  if (!productId) return false;
  const existing = await prisma.shoppingProduct.findUnique({ where: { productId: String(productId) } });
  if (existing) return false;

  const fields = mapMetaToProductFields(meta, commissionTable);
  if (!fields.name) return false; // not enough data to justify a catalog row

  const shopId = await ensureShopLink(fields);

  await prisma.shoppingProduct.create({
    data: {
      productId: String(productId),
      name: fields.name,
      shopName: fields.shopName ?? null,
      shopId,
      priceValue: fields.priceValue ?? null,
      imageUrl: fields.imageUrl ?? null,
      category: fields.category ?? null,
      isXtraCommission: fields.isXtraCommission ?? false,
      commissionRateValue: fields.commissionRateValue ?? null,
      commissionValue: fields.commissionValue ?? null,
    },
  });
  return true;
}

module.exports = {
  upsertMany,
  list,
  count,
  listCategories,
  remove,
  getById,
  ensureExists,
  ensureShopLink,
  SHOP_INCLUDE,
};
