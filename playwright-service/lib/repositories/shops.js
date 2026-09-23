const prisma = require('../prisma');
const { parseCommissionRatePct } = require('../shoppingProductMapper');

// Shops in Shopee's affiliate programme. Rows are created by
// lib/shopResolution.js (from GET /api/v3/offer/shop/list) and enriched by
// GET /api/v3/offer/shop - see docs/shopee-affiliate-api-spec.txt §1.1/§1.2.
//
// A shop is only shown to app users when it is `isActive`, `status === 'linked'`
// and actually has products. The search endpoint matches keywords fuzzily, so
// resolving one product's shop name routinely discovers several unrelated shops;
// those are kept (a free shop discovery, and an admin can crawl them later) but
// must never leak into the app before they have anything to show.
const VISIBLE_WHERE = { isActive: true, status: 'linked', productCount: { gt: 0 } };

// Shopee sends unix SECONDS. 32503651199 is its "no end date" sentinel (year
// 2999) - kept verbatim rather than mapped to null so "offer still running"
// stays a single `periodEndTime > now` comparison instead of an OR.
function toDate(unixSeconds) {
  if (unixSeconds == null) return null;
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000);
}

// Maps GET /api/v3/offer/shop/list's list element (and the overlapping half of
// GET /api/v3/offer/shop's payload) onto our columns.
function mapApiShop(apiShop) {
  const commissionRateText = (apiShop.commission_rate || '').trim() || null;
  return {
    shopId: String(apiShop.shop_id),
    // VERBATIM - see the Shop.name comment in schema.prisma. Only surrounding
    // whitespace is trimmed; the exact-match rule in lib/shopResolution.js
    // depends on nothing else being touched.
    name: (apiShop.shop_name || '').trim(),
    imageUrl: apiShop.shop_image || null,
    shopUrl: apiShop.shop_link || null,
    longLink: apiShop.long_link || null,
    commissionRateText,
    commissionRateValue: parseCommissionRatePct(commissionRateText),
    periodStartTime: toDate(apiShop.period_start_time),
    periodEndTime: toDate(apiShop.period_end_time),
    offerType: Number.isFinite(Number(apiShop.type)) ? Number(apiShop.type) : null,
    bannerCount: Number.isFinite(Number(apiShop.banner_count)) ? Number(apiShop.banner_count) : null,
  };
}

/**
 * Creates or refreshes a shop from an API payload.
 *
 * Deliberately never writes isActive / isFeatured / sortOrder / status on
 * update: those are an admin's curation and the record of whether this shop has
 * real products, and they have to survive every re-sync. Same discipline as
 * lib/categoryEnrichment.js:74-77. `status` is therefore only ever set here at
 * CREATE time, to its 'discovered' default (or whatever the caller passes for a
 * shop it already knows is linked).
 */
async function upsertFromApi(apiShop, { source = 'name_search', status } = {}) {
  const fields = mapApiShop(apiShop);
  if (!fields.shopId || !fields.name) return null;
  return prisma.shop.upsert({
    where: { shopId: fields.shopId },
    create: { ...fields, source, ...(status ? { status } : {}) },
    update: fields,
  });
}

// GET /api/v3/offer/shop adds what the list endpoint doesn't carry: rating,
// sold_total, follower counts and the portrait/cover images.
async function applyDetail(shopId, detail) {
  const base = mapApiShop({ ...detail, shop_id: shopId });
  return prisma.shop.update({
    where: { shopId: String(shopId) },
    data: {
      ...base,
      portraitUrl: detail.portrait || null,
      coverUrl: detail.cover || null,
      rating: Number.isFinite(Number(detail.rating)) ? Number(detail.rating) : null,
      soldTotal: Number.isFinite(Number(detail.sold_total)) ? Number(detail.sold_total) : null,
      followerCount: Number.isFinite(Number(detail.follower_count)) ? Number(detail.follower_count) : null,
      followersText: detail.followers || null,
      detailFetchedAt: new Date(),
    },
  });
}

async function getByShopId(shopId, { visibleOnly = false } = {}) {
  const shop = await prisma.shop.findUnique({ where: { shopId: String(shopId) } });
  if (!shop) return null;
  if (visibleOnly && !(shop.isActive && shop.status === 'linked' && shop.productCount > 0)) return null;
  return shop;
}

async function getById(id) {
  return prisma.shop.findUnique({ where: { id: Number(id) } });
}

const SORTS = {
  featured: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  newest: { createdAt: 'desc' },
  products_desc: { productCount: 'desc' },
  commission_desc: { commissionRateValue: 'desc' },
  sold_desc: { soldTotal: 'desc' },
};

// Shared by list() and count() so a filtered page and its total can never
// disagree - same arrangement as lib/repositories/shoppingProducts.js:35-74.
function buildWhere({ search, status, featuredOnly, visibleOnly } = {}) {
  const where = visibleOnly ? { ...VISIBLE_WHERE } : {};
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: 'insensitive' };
  }
  // An explicit status filter is the admin dashboard's; it wins over the
  // visibility default so admins can inspect `discovered` rows.
  if (status) where.status = status;
  if (featuredOnly === true) where.isFeatured = true;
  return where;
}

async function list({ limit = 20, offset = 0, sort, ...filters } = {}) {
  return prisma.shop.findMany({
    where: buildWhere(filters),
    orderBy: SORTS[sort] || SORTS.featured,
    take: limit,
    skip: offset,
  });
}

async function count(filters = {}) {
  return prisma.shop.count({ where: buildWhere(filters) });
}

async function listFeatured({ limit = 10 } = {}) {
  return prisma.shop.findMany({
    where: { ...VISIBLE_WHERE, isFeatured: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: limit,
  });
}

async function updateCuration(id, { isActive, isFeatured, sortOrder } = {}) {
  const current = await getById(id);
  if (!current) return null;
  return prisma.shop.update({
    where: { id: Number(id) },
    data: {
      isActive: isActive === undefined || isActive === null ? current.isActive : !!isActive,
      isFeatured: isFeatured === undefined || isFeatured === null ? current.isFeatured : !!isFeatured,
      sortOrder: sortOrder ?? current.sortOrder,
    },
  });
}

// FK is ON DELETE SET NULL, so the shop's products survive with shopId cleared
// rather than being deleted along with it.
async function remove(id) {
  const current = await getById(id);
  if (!current) return null;
  await prisma.shop.delete({ where: { id: Number(id) } });
  return current;
}

/**
 * Recomputes the denormalised productCount, and promotes 'discovered' ->
 * 'linked' for any shop that turns out to have products - that promotion is
 * what makes a shop visible to users, so it lives here (one place) rather than
 * being repeated by every writer.
 *
 * Pass the shop ids a job just touched to keep this cheap; omit for a full
 * rebuild (admin-triggered).
 */
async function refreshProductCounts(shopIds) {
  const ids = shopIds && shopIds.length ? [...new Set(shopIds.map(String))] : null;
  const grouped = await prisma.shoppingProduct.groupBy({
    by: ['shopId'],
    where: ids ? { shopId: { in: ids } } : { shopId: { not: null } },
    _count: { shopId: true },
  });
  const counts = new Map(grouped.map((r) => [r.shopId, r._count.shopId]));

  // Shops that were touched but came back with no products still need their
  // count zeroed (e.g. every product was reassigned), so iterate the requested
  // ids rather than only the ids the groupBy returned.
  const targets = ids || [...counts.keys()];
  let updated = 0;
  for (const shopId of targets) {
    const productCount = counts.get(shopId) || 0;
    const shop = await prisma.shop.findUnique({ where: { shopId }, select: { status: true, productCount: true } });
    if (!shop) continue;
    const status = productCount > 0 && shop.status === 'discovered' ? 'linked' : shop.status;
    if (shop.productCount === productCount && status === shop.status) continue;
    await prisma.shop.update({ where: { shopId }, data: { productCount, status } });
    updated++;
  }
  return updated;
}

/**
 * The per-shop crawl queue: every active, linked shop, oldest crawl first,
 * never-crawled shops first of all. `discovered` shops are excluded on purpose -
 * they are unverified fuzzy-search by-catch, and an admin opts them in one at a
 * time through the manual endpoint.
 */
async function listCrawlQueue({ limit = 8, ttlHours = 72 } = {}) {
  const cutoff = new Date(Date.now() - ttlHours * 3600 * 1000);
  return prisma.shop.findMany({
    where: {
      isActive: true,
      status: 'linked',
      OR: [{ lastCrawledAt: null }, { lastCrawledAt: { lt: cutoff } }],
    },
    orderBy: [
      { lastCrawledAt: { sort: 'asc', nulls: 'first' } },
      { isFeatured: 'desc' },
      { sortOrder: 'asc' },
    ],
    take: limit,
  });
}

async function markCrawled(shopId, { error = null, productCount } = {}) {
  return prisma.shop.update({
    where: { shopId: String(shopId) },
    data: {
      lastCrawledAt: new Date(),
      lastCrawlError: error,
      ...(productCount == null ? {} : { productCount }),
    },
  });
}

// Marks a shop as genuinely linked to products. Called by the resolution job
// once a product's shop name matched this shop exactly.
async function markLinked(shopId) {
  return prisma.shop.update({ where: { shopId: String(shopId) }, data: { status: 'linked' } });
}

module.exports = {
  VISIBLE_WHERE,
  mapApiShop,
  upsertFromApi,
  applyDetail,
  getByShopId,
  getById,
  list,
  count,
  listFeatured,
  updateCuration,
  remove,
  refreshProductCounts,
  listCrawlQueue,
  markCrawled,
  markLinked,
};
