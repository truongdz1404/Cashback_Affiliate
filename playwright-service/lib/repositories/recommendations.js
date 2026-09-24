const prisma = require('../prisma');
const searchHistoryRepo = require('./searchHistory');
// normalizeName/tokenize (and the STOPWORDS list they use)
// moved to lib/textMatch.js unchanged so the shop search ranker could share
// them - see the header there.
const { normalizeName, tokenize } = require('../textMatch');
// Every product this module hands back is serialized straight to a client, so
// it must carry the same embedded shop summary the filtered listing does - see
// the SHOP_INCLUDE comment in ./shoppingProducts.js for why all five query
// sites have to agree.
const { SHOP_INCLUDE } = require('./shoppingProducts');

// How far back into a user's "Tạo link" history to look for signal. Capped
// (not "all links ever") so a long-time user's taste can drift - their most
// recent handful of links should dominate the scoring, not their first ever.
const LINK_HISTORY_LIMIT = 50;
// Safety cap only, not a relevance cutoff - the catalog is currently a few
// thousand rows and scoring is a cheap in-memory pass, so we score the whole
// thing rather than pre-filtering by recency. A recency-based `take` here
// previously combined with `orderBy: scrapedAt desc` to silently and
// non-deterministically drop real matches: most rows share the same
// scrapedAt (one scrape batch), so ties broke in an unstable order and
// arbitrarily excluded some of them from every pool. If the catalog grows
// past this cap, revisit with a real pre-filter (e.g. by shop/category)
// instead of raising the number.
const CANDIDATE_POOL_SIZE = 5000;

// Recent Shopping-tab search terms are a weaker, noisier signal than an
// actual "Tạo link" action (a search doesn't mean a purchase), so they fold
// into keywordWeights at the same tier as a link's own category tokens
// rather than its item-name tokens.
const SEARCH_TERM_WEIGHT = 0.5;

// "Trending" nudge for scoreProduct: freshly-scraped products get a small,
// linearly-decaying bonus so new arrivals surface a bit above older items
// with an otherwise similar score.
//
// Both this and COMMISSION_MAX_BONUS below were cut hard (0.8 -> 0.35 and
// 1.5 -> 0.5). They exist to break ties between products the affinity rates
// equally, but at the old sizes they were larger than the affinity score of
// anything past roughly the 6th-most-recent signal - so a random
// high-commission product outranked a genuine match on an older interest.
// That is one half of why the recommendations looked like nothing but the
// last thing tapped; the steepness of weightAt() below was the other half.
const TREND_WINDOW_DAYS = 14;
const TREND_MAX_BONUS = 0.35;
const COMMISSION_MAX_BONUS = 0.5;

// No single shop may take more than this share of one page of results, so a
// user who tapped four things in the same store still gets a varied list.
// Applied after interleaving, and deliberately a share rather than a fixed
// number so it scales with `limit`.
const MAX_SHOP_SHARE = 0.4;

// How far the personalized part of the Home feed runs before it falls through
// to the plain top-commission list. The feed is an endless vertical grid now,
// but a user's link history can only justify so many products; past a few
// hundred the scoring is noise, and stopping here also bounds the work below.
const FEED_DEPTH = 300;

// Scoring the candidate pool costs well over a second on the production box,
// and it used to be paid once per request. That was fine for a fixed rail of
// ten; it is not fine for a feed that asks for another page every time the
// user's thumb moves. The ORDER cannot change between two scrolls anyway, so
// it is computed once and remembered as a list of product ids - later pages
// only fetch the rows they actually show.
//
// Short-lived on purpose: three minutes covers one continuous scroll, and is
// short enough that a link the user creates right afterwards shows up in
// their suggestions almost immediately. Bounded in size so a burst of users
// cannot grow it without limit; a miss only costs the scoring pass again.
const FEED_CACHE_TTL_MS = 3 * 60 * 1000;
// The TTL slides on every page, so one continuous scroll keeps ONE ordering
// however long it lasts - re-ranking halfway down would shuffle products the
// user has already scrolled past back into their path. The ceiling stops that
// from going on forever: a feed open for half an hour gets rebuilt.
const FEED_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const FEED_CACHE_MAX_USERS = 500;

const feedOrderCache = new Map();

function readFeedOrder(userId) {
  const hit = feedOrderCache.get(userId);
  if (!hit) return null;
  const now = Date.now();
  if (now >= hit.expiresAt || now >= hit.builtAt + FEED_CACHE_MAX_AGE_MS) {
    feedOrderCache.delete(userId);
    return null;
  }
  hit.expiresAt = now + FEED_CACHE_TTL_MS;
  return hit.ids;
}

function writeFeedOrder(userId, ids) {
  // Insertion-ordered Map, and every write re-inserts, so the first key is
  // always the least recently built ordering.
  if (feedOrderCache.size >= FEED_CACHE_MAX_USERS && !feedOrderCache.has(userId)) {
    const oldest = feedOrderCache.keys().next();
    if (!oldest.done) feedOrderCache.delete(oldest.value);
  }
  const now = Date.now();
  feedOrderCache.delete(userId);
  feedOrderCache.set(userId, { ids, builtAt: now, expiresAt: now + FEED_CACHE_TTL_MS });
}

// Called when something happens that changes what a user should be shown -
// creating a link is the whole input to the scoring, so an ordering built
// before it is stale. Without this a user could tap a product and then scroll
// a feed that still knows nothing about it for half an hour.
function invalidateFeedOrder(userId) {
  feedOrderCache.delete(userId);
}

// Loads products for a remembered slice of the ordering, keeping that order -
// `IN (...)` comes back in whatever order Postgres likes. Asks for a few more
// ids than the page needs so a product deleted since the ordering was built
// shortens the window rather than the page: a short page is how the client
// decides it has reached the end of the feed.
async function productsInOrder(ids) {
  if (!ids.length) return [];
  const rows = await prisma.shoppingProduct.findMany({
    where: { id: { in: ids } },
    include: SHOP_INCLUDE,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

// Recency decay across the user's signal history.
//
// Was 1/(index+1) - a harmonic curve so steep that the 10th most recent
// signal counted a tenth of the 1st, and the 20th a twentieth. Multiplied
// through scoreProduct's x5/x3/x2 that pushed everything past the first
// handful below the tie-breaker ceiling, so older tastes were not merely
// ranked lower, they were invisible. 1/sqrt keeps the same "most recent
// wins" ordering with a far gentler tail: the 10th now counts a third of the
// 1st, the 50th a seventh.
function weightAt(index) {
  return 1 / Math.sqrt(index + 1);
}

// `skip` exists because the Home feed is paginated: once a user has scrolled
// past everything their history can explain, the rest of the feed is this
// list, and it has to keep advancing instead of handing back the same
// top-commission products on every further page. `id desc` breaks ties for
// the same reason it does in rankProductsForUser - most rows share a
// scrapedAt, and an unstable tie order makes skip/take repeat or drop rows.
async function fallbackProducts(limit, excludeIds = new Set(), skip = 0) {
  const products = await prisma.shoppingProduct.findMany({
    where: excludeIds.size ? { id: { notIn: [...excludeIds] } } : undefined,
    include: SHOP_INCLUDE,
    orderBy: [{ commissionRateValue: 'desc' }, { scrapedAt: 'desc' }, { id: 'desc' }],
    take: limit,
    skip,
  });
  return products;
}

// Adds `weight` to `map[key]`, and remembers the SMALLEST (i.e. most recent)
// signal index that ever contributed to it. That index is what orders the
// interleaving buckets further down - see interleaveByGroup.
function bump(map, key, weight, index) {
  if (!key) return;
  const current = map.get(key);
  if (current) {
    current.weight += weight;
    if (index < current.index) current.index = index;
  } else {
    map.set(key, { weight, index });
  }
}

/**
 * Fills in the content snapshot links are missing by joining them to our own
 * catalog on itemId -> shopping_products.productId.
 *
 * A Link row only carries itemName/catName/shopName when the addlivetag
 * commission lookup succeeded; when it falls back to the browser path they
 * are all null, and on production that is the common case (71 of 74 rows at
 * the time this was written). Those links were completely invisible to the
 * scoring below. Now that every catalogue row has a real category and a real
 * shopId, any link whose item we also scraped can recover all of it for the
 * price of one extra query - and gains something the snapshot never had: the
 * shop's id, which matches exactly instead of by normalised name.
 */
async function hydrateLinksFromCatalog(links) {
  const itemIds = [...new Set(links.map((l) => l.itemId).filter(Boolean))];
  if (itemIds.length === 0) return links;

  const rows = await prisma.shoppingProduct.findMany({
    where: { productId: { in: itemIds } },
    select: { productId: true, name: true, category: true, shopName: true, shopId: true, priceValue: true },
  });
  if (rows.length === 0) return links;

  const byItemId = new Map(rows.map((r) => [r.productId, r]));
  return links.map((link) => {
    const found = link.itemId ? byItemId.get(link.itemId) : null;
    if (!found) return link;
    // The link's own snapshot wins where it exists - it was taken at link
    // time and describes what the user actually saw. The catalogue only fills
    // the holes, and contributes shopId either way since Link has no column
    // for it.
    return {
      ...link,
      itemName: link.itemName || found.name,
      catName: link.catName || found.category,
      shopName: link.shopName || found.shopName,
      priceValue: link.priceValue != null ? link.priceValue : found.priceValue,
      shopId: link.shopId || found.shopId || null,
    };
  });
}

// Builds the per-user weight maps off "Tạo link" history - the shared input
// to scoreProduct() below. Extracted out of recommendForUser so the same
// affinity can drive both the Home-tab "Gợi ý cho bạn" widget and the
// Shopping-tab personalized ordering, without scoring twice differently.
async function buildAffinity(userId) {
  const [rawLinks, recentSearchTerms] = await Promise.all([
    prisma.link.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: 'desc' },
      take: LINK_HISTORY_LIMIT,
    }),
    searchHistoryRepo.recentTerms(userId),
  ]);

  const links = await hydrateLinksFromCatalog(rawLinks);
  const withSignal = links.filter((l) => l.catName || l.shopName || l.itemName || l.shopId);
  if (withSignal.length === 0 && recentSearchTerms.length === 0) {
    return { hasSignal: false, alreadyLinkedItemIds: new Set() };
  }

  const alreadyLinkedItemIds = new Set(links.map((l) => l.itemId).filter(Boolean));
  const catWeights = new Map();
  const shopWeights = new Map();
  const shopIdWeights = new Map();
  const keywordWeights = new Map();
  const prices = [];

  withSignal.forEach((link, index) => {
    const weight = weightAt(index);
    bump(shopIdWeights, link.shopId, weight, index);
    bump(catWeights, normalizeName(link.catName), weight, index);
    bump(shopWeights, normalizeName(link.shopName), weight, index);
    for (const token of tokenize(link.itemName)) bump(keywordWeights, token, weight, index);
    for (const token of tokenize(link.catName)) bump(keywordWeights, token, weight * 0.5, index);
    if (link.priceValue != null) prices.push(link.priceValue);
  });

  // Searches continue the same index line rather than restarting at 0, so a
  // term typed today cannot outweigh a link actually created today.
  const searchIndexBase = withSignal.length;
  recentSearchTerms.forEach((term, offset) => {
    const index = searchIndexBase + offset;
    const weight = weightAt(index) * SEARCH_TERM_WEIGHT;
    for (const token of tokenize(term)) bump(keywordWeights, token, weight, index);
  });

  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  // Wide-ish band (0.4x-2.5x average) - this is a soft nudge, not a filter,
  // so it shouldn't hide otherwise-good matches over a modest price gap.
  const priceLow = avgPrice != null ? avgPrice * 0.4 : null;
  const priceHigh = avgPrice != null ? avgPrice * 2.5 : null;

  return {
    hasSignal: true,
    alreadyLinkedItemIds,
    catWeights,
    shopWeights,
    shopIdWeights,
    keywordWeights,
    avgPrice,
    priceLow,
    priceHigh,
  };
}

/**
 * Same additive heuristic used by both callers: shop match (x5) + category
 * match (x3) + keyword overlap (x2/token) + price-band proximity (+1) + small
 * commission and freshness tie-breakers.
 *
 * Returns { score, group, matched }. `group` names the single strongest
 * interest this product answers to ("shop:123", "cat:thoi trang nu", ...) and
 * is what interleaveByGroup deals between; `matched` is false when the only
 * thing that scored was a tie-breaker, i.e. the product answers to nothing
 * the user has ever shown interest in.
 */
function scoreProduct(product, affinity) {
  if (!affinity.hasSignal) return { score: 0, group: null, matched: false };
  const { shopWeights, shopIdWeights, catWeights, keywordWeights, avgPrice, priceLow, priceHigh } = affinity;
  let score = 0;
  // Tracks the strongest single contribution so the product can be filed
  // under the interest that best explains it.
  let bestPart = 0;
  let group = null;
  const claim = (part, key, index) => {
    if (part <= bestPart) return;
    bestPart = part;
    group = { key, index };
  };

  const productShopName = normalizeName(product.shopName);
  const productCategory = normalizeName(product.category);

  // shopId is exact where we have it on both sides; the normalised name is
  // the fallback for links whose item never made it into the catalogue. Only
  // one of the two may score, or a shop we know by both routes counts twice.
  const shopIdEntry = product.shopId ? shopIdWeights.get(product.shopId) : null;
  const shopNameEntry = shopIdEntry ? null : productShopName ? shopWeights.get(productShopName) : null;
  if (shopIdEntry) {
    const part = 5 * shopIdEntry.weight;
    score += part;
    claim(part, `shop:${product.shopId}`, shopIdEntry.index);
  } else if (shopNameEntry) {
    const part = 5 * shopNameEntry.weight;
    score += part;
    claim(part, `shop:${productShopName}`, shopNameEntry.index);
  }

  const catEntry = productCategory ? catWeights.get(productCategory) : null;
  if (catEntry) {
    const part = 3 * catEntry.weight;
    score += part;
    claim(part, `cat:${productCategory}`, catEntry.index);
  }

  for (const token of tokenize(product.name)) {
    const entry = keywordWeights.get(token);
    if (!entry) continue;
    const part = 2 * entry.weight;
    score += part;
    claim(part, `kw:${token}`, entry.index);
  }

  const matched = bestPart > 0;

  if (avgPrice != null && product.priceValue != null && product.priceValue >= priceLow && product.priceValue <= priceHigh) {
    score += 1;
  }
  if (product.commissionRateValue != null) {
    score += Math.min(product.commissionRateValue / 60, COMMISSION_MAX_BONUS);
  }
  if (product.scrapedAt) {
    const ageDays = (Date.now() - new Date(product.scrapedAt).getTime()) / 86400000;
    if (ageDays < TREND_WINDOW_DAYS) {
      score += TREND_MAX_BONUS * (1 - ageDays / TREND_WINDOW_DAYS);
    }
  }

  return { score, group, matched };
}

/**
 * Turns one flat score-sorted list into a blended one.
 *
 * Sorting by score alone is why the results looked like a single interest
 * repeated: whatever the user touched last carries the heaviest weight, so
 * every product answering to it outscores the best match on anything older,
 * and the whole page comes from one shop or one category.
 *
 * Here every product is filed under the interest that best explains it, the
 * buckets are ordered by how strong that interest is (so the newest still
 * leads), and the page is then dealt round-robin: the best match on the most
 * recent interest, then the best on the next, and so on, wrapping around once
 * every bucket has had a turn. Recent still dominates - it leads, and it gets
 * a turn in every round - but older interests are guaranteed a slot instead
 * of being buried.
 *
 * The shop cap then stops any one shop owning more than its share of the
 * page, for the case where several recent links point at the same store and
 * there is really only one bucket to deal from.
 */
function interleaveByGroup(entries, limit, { capShare = MAX_SHOP_SHARE, capWindow = limit } = {}) {
  const buckets = new Map();
  const unmatched = [];

  for (const entry of entries) {
    if (!entry.matched || !entry.group) {
      unmatched.push(entry);
      continue;
    }
    const key = entry.group.key;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { index: entry.group.index, best: entry.score, items: [] };
      buckets.set(key, bucket);
    }
    bucket.items.push(entry);
    if (entry.score > bucket.best) bucket.best = entry.score;
    if (entry.group.index < bucket.index) bucket.index = entry.group.index;
  }

  // Strongest interest first. `index` (how recent the interest is) breaks
  // ties, so two equally-scoring buckets still deal newest-first.
  const ordered = [...buckets.values()].sort((a, b) => b.best - a.best || a.index - b.index);
  for (const bucket of ordered) bucket.items.sort((a, b) => b.score - a.score);
  unmatched.sort((a, b) => b.score - a.score);

  // The shop quota is a PAGE budget, not a lifetime one: it counts only the
  // last `capWindow` items placed. With the default window (the caller asks
  // for one page) that is exactly the old behaviour. It matters when the
  // caller blends a long list in one go for a paginated feed - a lifetime
  // quota would spend a shop's whole allowance on page one and never show it
  // again, where what we want is "no more than two in five, on every page".
  const maxPerShop = Math.max(1, Math.ceil(capWindow * capShare));
  // A quota as large as the window can never block, so skip the bookkeeping
  // entirely - that is the full-catalog ordering, which passes capShare: 1.
  const capDisabled = maxPerShop >= capWindow;
  const out = [];
  const shopKeys = [];

  const shopKeyOf = (entry) => entry.product.shopId || normalizeName(entry.product.shopName) || null;

  const overQuota = (shopKey) => {
    if (capDisabled || !shopKey) return false;
    let used = 0;
    for (let i = Math.max(0, out.length - capWindow); i < out.length; i += 1) {
      if (shopKeys[i] === shopKey) used += 1;
    }
    return used >= maxPerShop;
  };

  const place = (entry) => {
    out.push(entry);
    shopKeys.push(shopKeyOf(entry));
  };

  // Round-robin across buckets until the list is full or everything is used.
  const cursors = ordered.map(() => 0);
  let progressed = true;
  while (out.length < limit && progressed) {
    progressed = false;
    for (let i = 0; i < ordered.length && out.length < limit; i += 1) {
      if (cursors[i] >= ordered[i].items.length) continue;
      const entry = ordered[i].items[cursors[i]];
      // An entry the quota blocks keeps its place in its bucket and gets
      // another turn once the window has slid past whatever blocked it. It is
      // postponed, never discarded - which is why there is no deferred pile
      // any more.
      if (overQuota(shopKeyOf(entry))) continue;
      cursors[i] += 1;
      place(entry);
      progressed = true;
    }
    if (!progressed) {
      // Every bucket that still holds something is blocked by the quota: they
      // all point at the same shop and there is genuinely nothing else to
      // show. Place one anyway rather than cutting the list short.
      for (let i = 0; i < ordered.length && out.length < limit; i += 1) {
        if (cursors[i] >= ordered[i].items.length) continue;
        place(ordered[i].items[cursors[i]]);
        cursors[i] += 1;
        progressed = true;
        break;
      }
    }
  }

  // Products that answer to nothing the user showed interest in only ever pad
  // a list that came up short.
  for (const entry of unmatched) {
    if (out.length >= limit) break;
    place(entry);
  }

  return out;
}

/**
 * Recommends shopping_products for a user based on their "Tạo link" history
 * (the links table) plus recent Shopping-tab searches - the only per-user
 * signals this app has, since there's no wishlist or dwell-time tracking.
 * Each Link row carries a best-effort content snapshot
 * (itemName/catName/shopName/priceValue) taken for free off the same
 * addlivetag commission lookup /app/link already makes (see lib/commission.js);
 * whatever that lookup missed is recovered by joining the link's itemId back
 * to our own catalogue - see hydrateLinksFromCatalog.
 *
 * Scoring is a simple additive heuristic (shop match + category match +
 * keyword overlap + price-band proximity + small commission/freshness
 * tie-breakers) - deliberately not ML/embeddings, so it runs with zero extra
 * infra on top of data already being collected. The scored list is then
 * blended across interests by interleaveByGroup so the page is not one
 * interest repeated. Users with no usable history at all get the
 * top-commission catalog instead, so the section is never empty.
 *
 * Paginated, because the Home tab is an endless vertical grid rather than a
 * rail of ten. The whole feed is ordered in one pass and then sliced: ordering
 * page by page would let a product that ranked 11th on page one rank 3rd on
 * page two and appear twice. The blend still spends its shop quota per page
 * (capWindow) so no page is dominated by one shop, and the ordering is cached
 * per user so scrolling does not re-score the catalogue on every page.
 */
async function recommendForUser(userId, { limit = 10, offset = 0 } = {}) {
  // Past the personalized part there is nothing left to personalize with, so
  // the feed continues down the top-commission catalogue instead of stopping.
  // `order` is the personalized ordering this feed is paging through. It is
  // excluded wholesale from the fallback, not just the current page: the two
  // lists are drawn from the same catalogue, so without that, a product shown
  // on page 3 comes back as filler on page 13. Excluding a fixed set also
  // makes `skip` exact, because the fallback list is then the same list on
  // every page.
  const servePadded = async (items, reason, order) => {
    if (items.length >= limit) return { items, reason };
    const excludeIds = new Set(order);
    for (const p of items) excludeIds.add(p.id);
    const skip = Math.max(0, offset + items.length - order.length);
    const filler = await fallbackProducts(limit - items.length, excludeIds, skip);
    return { items: [...items, ...filler], reason };
  };

  const cachedOrder = readFeedOrder(userId);
  if (cachedOrder) {
    const page = offset < cachedOrder.length
      ? await productsInOrder(cachedOrder.slice(offset, offset + limit))
      : [];
    // A page can only come back short because rows were deleted since the
    // ordering was built, or because the ordering ran out here. The second is
    // the real end of the personalized feed; the first would wrongly look like
    // it, so re-blend rather than serve it.
    if (page.length === limit || offset + limit >= cachedOrder.length) {
      return servePadded(page, 'personalized', cachedOrder);
    }
  }

  const affinity = await buildAffinity(userId);
  if (!affinity.hasSignal) {
    return { items: await fallbackProducts(limit, new Set(), offset), reason: 'no_history' };
  }

  const { alreadyLinkedItemIds } = affinity;
  const candidates = await prisma.shoppingProduct.findMany({
    where: alreadyLinkedItemIds.size ? { productId: { notIn: [...alreadyLinkedItemIds] } } : undefined,
    include: SHOP_INCLUDE,
    orderBy: { id: 'desc' },
    take: CANDIDATE_POOL_SIZE,
  });

  const scored = candidates
    .map((product) => ({ product, ...scoreProduct(product, affinity) }))
    .filter((entry) => entry.score > 0);

  const blended = interleaveByGroup(scored, FEED_DEPTH, { capWindow: limit }).map((entry) => entry.product);
  const order = blended.map((p) => p.id);
  writeFeedOrder(userId, order);

  const page = blended.slice(offset, offset + limit);
  // 'no_match' describes the user's history, not this page: a later page
  // running out of personalized results is just the end of the feed.
  return servePadded(page, blended.length ? 'personalized' : 'no_match', order);
}

/**
 * Personalized ordering for the full Shopping-tab catalog browse (and its
 * search box): unlike recommendForUser, this never drops a product - it
 * scores the whole (optionally search-filtered) catalog and blends matches to
 * the top, letting unmatched products sink to the bottom rather than
 * disappearing. Used only for the "no explicit filter/sort" and "search"
 * branches of /app/shopping-products; as soon as the user sets a
 * price/commission filter or picks a sort, the route falls back to the
 * original DB-pushdown pagination untouched.
 */
async function rankProductsForUser(userId, { search, limit = 20, offset = 0 } = {}) {
  const affinity = await buildAffinity(userId);
  const where = {};
  if (search && search.trim()) {
    where.name = { contains: search.trim(), mode: 'insensitive' };
  }

  if (!affinity.hasSignal) {
    // `id desc` tiebreak: most rows share a `scrapedAt` (one scrape batch),
    // so ordering by scrapedAt alone leaves ties in an unstable order and
    // skip/take pagination can repeat or skip rows across pages - same
    // class of bug documented above on CANDIDATE_POOL_SIZE.
    return prisma.shoppingProduct.findMany({
      where,
      include: SHOP_INCLUDE,
      orderBy: [{ scrapedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
    });
  }

  const candidates = await prisma.shoppingProduct.findMany({
    where,
    include: SHOP_INCLUDE,
    orderBy: { id: 'desc' },
    take: CANDIDATE_POOL_SIZE,
  });

  const scored = candidates.map((product) => ({ product, ...scoreProduct(product, affinity) }));

  // Blend the WHOLE list, not just the page being asked for: interleaving
  // per page would deal a fresh round-robin at every offset and repeat the
  // same products across pages. The shop cap is off here for the same reason
  // - on a full-catalog ordering it would just push a shop's products down
  // into the deferred tail rather than off the page. The cost is scoring the
  // pool once per request, which this branch already paid.
  const blended = interleaveByGroup(scored, scored.length, { capShare: 1 }).map((entry) => entry.product);

  return blended.slice(offset, offset + limit);
}

module.exports = {
  recommendForUser,
  invalidateFeedOrder,
  rankProductsForUser,
  buildAffinity,
  scoreProduct,
  interleaveByGroup,
  weightAt,
};
