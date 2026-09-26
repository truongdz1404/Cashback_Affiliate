const prisma = require('../prisma');
const { parseCommissionRatePct } = require('../shoppingProductMapper');
const { foldForSearch } = require('../textMatch');

// Safety cap for searchRanked()'s fallback sweep, which runs only when the
// folded substring pre-filter finds nothing. Shops number in the low thousands
// (3,528 as of Sep 2026, one row per affiliate storefront), so scoring the
// biggest visible ones in memory stays cheap; the cap is what stops that from
// becoming a full table scan if the catalogue ever grows an order of magnitude.
const CANDIDATE_POOL_SIZE = 2000;

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

/**
 * Creates the bare Shop row a product needs before it can carry a shopId.
 *
 * shopping_products.shop_id has a foreign key, so a product can only ever be
 * attributed to a shop that already exists. This path learns about shops from
 * addlivetag's product lookup - which hands back shop_id and shop_name for free
 * with every commission check (see lib/commission.js#mapInfoToMeta) - so the row
 * it can create starts with nothing but an id and a name.
 *
 * That bareness is the whole reason this is a separate function from
 * upsertFromApi, and why refreshProductCounts below will NOT promote what it
 * creates: these arrive in the thousands, and a shop with no avatar would render
 * as a blank card in the app's shop search the moment it had one product.
 * lib/shopDetailEnrichment.js fetches the images and rating; promotion follows
 * from there.
 *
 * Never modifies an existing row - a shop already known from Shopee's search
 * endpoint has strictly better data than the two fields available here.
 */
async function ensureFromProduct({ shopId, name } = {}) {
  const id = shopId == null ? '' : String(shopId).trim();
  const shopName = String(name || '').trim();
  if (!id || !shopName) return null;
  return prisma.shop.upsert({
    where: { shopId: id },
    create: { shopId: id, name: shopName, source: 'addlivetag' },
    update: {},
  });
}

// Keys the detail payload didn't carry are removed rather than written as
// null. The two endpoints overlap (spec §1.2), but a shop whose detail comes
// back without `long_link` must not lose the one we already hold - that link is
// the byte-for-byte reference the link builder is checked against - and a
// missing `shop_name` would blank the name the exact-match rule depends on.
function dropEmpty(fields) {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null && v !== ''));
}

// GET /api/v3/offer/shop adds what the list endpoint doesn't carry: rating,
// sold_total, follower counts and the portrait/cover images.
async function applyDetail(shopId, detail) {
  const base = dropEmpty(mapApiShop({ ...detail, shop_id: shopId }));
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
      detailCheckedAt: new Date(),
    },
  });
}

/**
 * The enrichment queue: shops that have products but no detail yet.
 *
 * `detailCheckedAt` is separate from `detailFetchedAt` on purpose, and it is the
 * same lesson lib/categoryEnrichment.js had to learn the hard way. "Has no
 * detail" alone is not a queue: a shop Shopee cannot answer about keeps failing,
 * keeps having no detail, and so keeps being picked first - parking itself at
 * the head forever while everything behind it starves. Stamping every shop that
 * was actually asked about, answered or not, is what makes the queue drain.
 *
 * Shops with no products wait: there are thousands of them and none is visible
 * to anyone, so spending a request on one ahead of a shop a user could see
 * tomorrow is backwards.
 */
async function listDetailQueue({ limit = 20 } = {}) {
  return prisma.shop.findMany({
    where: { isActive: true, detailFetchedAt: null, productCount: { gt: 0 } },
    orderBy: [
      { detailCheckedAt: { sort: 'asc', nulls: 'first' } },
      { productCount: 'desc' },
    ],
    take: limit,
  });
}

async function markDetailChecked(shopIds) {
  const ids = [...new Set((shopIds || []).map(String))];
  if (!ids.length) return 0;
  const { count } = await prisma.shop.updateMany({
    where: { shopId: { in: ids } },
    data: { detailCheckedAt: new Date() },
  });
  return count;
}

/**
 * The only shape of a shop an app user is ever allowed to see.
 *
 * `longLink` and `shopUrl` are the reason this function exists. Both open the
 * storefront, and `longLink` even looks like a finished affiliate link - but it
 * is the affiliate account's own link with an EMPTY subId, so an order placed
 * through it can never be traced back to a user and nobody gets paid. Handing
 * either of them to the client puts a working, plausible, unattributed "Xem
 * shop trên Shopee" button one line of JSX away. Products inside the shop
 * screen still mint a real per-user link on tap, which is the supported path.
 *
 * The rest is operational detail - crawl timestamps, the last crawl error,
 * curation order, `status` - that a user has no use for and that would leak
 * how the catalog is assembled.
 */
function toAppShop(shop) {
  if (!shop) return null;
  return {
    // `id` stays because the app's infinite-query helpers dedupe on it.
    id: shop.id,
    shopId: shop.shopId,
    name: shop.name,
    imageUrl: shop.imageUrl,
    portraitUrl: shop.portraitUrl,
    coverUrl: shop.coverUrl,
    // Shopee's own headline rate, on purpose: the storefront badge is a
    // "Hoàn đến" teaser and the operator wants the bigger number on it. The
    // product cards inside the shop are the ones that must be exact, and they
    // carry userCommission* instead - see toPublicProduct in ../commissionSplit.js.
    commissionRateText: shop.commissionRateText,
    commissionRateValue: shop.commissionRateValue,
    rating: shop.rating,
    soldTotal: shop.soldTotal,
    followerCount: shop.followerCount,
    followersText: shop.followersText,
    productCount: shop.productCount,
    isFeatured: shop.isFeatured,
  };
}

function toAppShops(shops) {
  return (shops || []).map(toAppShop);
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

// Which of these shop ids we already hold. One query instead of a per-candidate
// existence check, and it is the only way to tell "created" from "updated"
// afterwards - prisma.upsert doesn't say which branch it took.
async function existingShopIds(shopIds) {
  const ids = (shopIds || []).map(String).filter(Boolean);
  if (!ids.length) return [];
  const rows = await prisma.shop.findMany({
    where: { shopId: { in: ids } },
    select: { shopId: true },
  });
  return rows.map((r) => r.shopId);
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
function buildWhere({ search, status, featuredOnly, visibleOnly, isActive } = {}) {
  const where = visibleOnly ? { ...VISIBLE_WHERE } : {};
  if (search && search.trim()) {
    // Folded, like searchRanked below and the product list: this is the same
    // box to the user, and "dong ho" finding nothing while "Đồng Hồ" finds
    // forty would read as the shop list being broken, not as a tone rule.
    const folded = foldForSearch(search);
    if (folded) where.nameFolded = { contains: folded };
  }
  // An explicit status filter is the admin dashboard's; it wins over the
  // visibility default so admins can inspect `discovered` rows.
  if (status) where.status = status;
  if (featuredOnly === true) where.isFeatured = true;
  // Admin-only: the kill switch is invisible in the app (a hidden shop simply
  // is not there), so the dashboard is the only place it can be audited.
  if (isActive === true || isActive === false) where.isActive = isActive;
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

// How many name matches to pull back before scoring. The scoring is a cheap
// in-memory pass, but `contains` on a common word ("shop", "store") can match
// a lot of rows and only the top one or two are ever shown.
const SEARCH_CANDIDATE_POOL = 40;

/**
 * Scores one shop against what a user typed, so the Shopping tab can put a
 * single shop card above the product grid when the search obviously names a
 * shop - and show nothing when it doesn't.
 *
 * Deliberately blunt, and deliberately the ONLY fuzzy name matching in the
 * codebase: deciding which shop a product belongs to is a money decision and
 * stays byte-exact (see lib/shopResolution.js). Getting a shop card wrong just
 * shows the wrong storefront above a correct product list.
 *
 * The score bands are ordered so a weaker band can never overtake a stronger
 * one: the popularity bonus is capped at 20, below the 25-point gap between
 * any two bands.
 */
function scoreShopAgainstQuery(shop, foldedQuery) {
  const name = foldForSearch(shop.name);
  if (!name || !foldedQuery) return 0;

  let score;
  if (name === foldedQuery) score = 400;
  else if (name.startsWith(foldedQuery)) score = 300;
  // Whole-word hit ("cocoon" inside "cocoon vietnam chinh hang") beats a match
  // that lands mid-word ("coon" inside "cocoon"), which is usually noise.
  else if (new RegExp(`(^| )${foldedQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(name)) score = 200;
  else if (name.includes(foldedQuery)) score = 100;
  // The other direction: someone typed the shop's full name plus a product
  // word ("cocoon cà phê đắk lắk"). Worth showing, but weakest.
  else if (foldedQuery.includes(name) && name.length >= 4) score = 75;
  else return 0;

  // Tiny nudge by catalog size, so between two similarly-named shops the one
  // that can actually show something wins. log10 keeps a 5000-product shop
  // from burying a 50-product exact match.
  return score + Math.min(Math.log10(shop.productCount + 1) * 6, 20);
}

/**
 * The shop card above the Shopping tab's search results. Returns [] rather
 * than a weak guess when nothing scores - an empty result is the correct
 * answer for the many searches that name a product, not a shop.
 */
async function searchRanked({ search, limit = 1 } = {}) {
  const folded = foldForSearch(search);
  if (folded.length < 2) return [];

  // The SQL pre-filter now runs on `name_folded`, the same fold this function
  // scores with - so "thuoc nhuom" pre-matches "THUỐC NHUỘM" instead of
  // falling through. The column is GENERATED ALWAYS in Postgres with its own
  // GIN trgm index (prisma/migrations/20260925180000_add_folded_name_search);
  // already lowercase, hence a plain `contains` and no `mode: 'insensitive'`,
  // which would cost the index.
  //
  // The whole-catalogue fallback below stays: this is still a substring net,
  // and a query that only overlaps a shop name in pieces ("cocoon ca phe dak
  // lak" vs "Cocoon Vietnam") reaches the scorer only that way.
  let candidates = await prisma.shop.findMany({
    where: { ...VISIBLE_WHERE, nameFolded: { contains: folded } },
    take: SEARCH_CANDIDATE_POOL,
  });
  if (!candidates.length) {
    candidates = await prisma.shop.findMany({
      where: VISIBLE_WHERE,
      orderBy: { productCount: 'desc' },
      take: CANDIDATE_POOL_SIZE,
    });
  }

  return candidates
    .map((shop) => ({ shop, score: scoreShopAgainstQuery(shop, folded) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.shop);
}

// The fill below only considers shops with at least this many products. A
// "Shop nổi bật" card that opens onto two items reads as broken, and most
// visible shops are still thin: the by-shop crawl takes one pass per shop, so
// productCount climbs for days after a shop first becomes visible.
const FEATURED_FILL_MIN_PRODUCTS = 5;

// Hand-picked shops first, then fill the rest of the rail automatically.
//
// The fill is what makes this usable on day one: nobody has ticked "Nổi bật"
// yet, so without it every home screen would show an empty rail until an admin
// curates one by hand. Highest cashback leads, which is what the rail sells.
// An admin ticking shops pushes the fill out one slot at a time, so curation
// always wins without needing a separate "auto or manual" setting.
//
// If too few shops clear FEATURED_FILL_MIN_PRODUCTS to fill the rail, the bar is
// dropped rather than returning a short rail - a thin shop is still better than
// a gap, and early on (or with a wide limit) that is the common case.
async function listFeatured({ limit = 10 } = {}) {
  const picked = await prisma.shop.findMany({
    where: { ...VISIBLE_WHERE, isFeatured: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: limit,
  });
  if (picked.length >= limit) return picked;

  const exclude = picked.map((shop) => shop.id);
  const fill = (minProducts) =>
    prisma.shop.findMany({
      where: {
        ...VISIBLE_WHERE,
        // Overrides VISIBLE_WHERE's `productCount > 0` - spread order matters.
        ...(minProducts > 1 ? { productCount: { gte: minProducts } } : {}),
        id: { notIn: exclude },
      },
      // Postgres sorts NULLs first on DESC, which would put every shop whose
      // commission we have not fetched yet at the head of the rail.
      orderBy: [
        { commissionRateValue: { sort: 'desc', nulls: 'last' } },
        { productCount: 'desc' },
        { id: 'asc' },
      ],
      take: limit - picked.length,
    });

  let rest = await fill(FEATURED_FILL_MIN_PRODUCTS);
  if (picked.length + rest.length < limit) rest = await fill(1);
  return [...picked, ...rest];
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
 * Promotion also requires an avatar. Shops used to arrive only from Shopee's
 * search endpoint, which always sends `shop_image`, so for that path this
 * changes nothing. ensureFromProduct above is the new path, and it can only
 * supply an id and a name - promoting those would put blank cards in the app's
 * shop search the instant a single product linked to one. The avatar is the
 * cheapest honest proof that lib/shopDetailEnrichment.js has been round the
 * shop and filled in the rest (rating, followers, cover).
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
    const shop = await prisma.shop.findUnique({
      where: { shopId },
      select: { status: true, productCount: true, imageUrl: true },
    });
    if (!shop) continue;
    const status =
      productCount > 0 && shop.status === 'discovered' && !!shop.imageUrl ? 'linked' : shop.status;
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
  toAppShop,
  toAppShops,
  mapApiShop,
  upsertFromApi,
  ensureFromProduct,
  applyDetail,
  listDetailQueue,
  markDetailChecked,
  getByShopId,
  getById,
  existingShopIds,
  list,
  count,
  listFeatured,
  searchRanked,
  scoreShopAgainstQuery,
  updateCuration,
  remove,
  refreshProductCounts,
  listCrawlQueue,
  markCrawled,
  markLinked,
};
