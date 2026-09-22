const prisma = require('../prisma');
const searchHistoryRepo = require('./searchHistory');

// How far back into a user's "Tạo link" history to look for signal. Capped
// (not "all links ever") so a long-time user's taste can drift - their most
// recent handful of links should dominate the scoring, not their first ever.
const LINK_HISTORY_LIMIT = 50;
// Safety cap only, not a relevance cutoff - the catalog is currently a few
// hundred rows and scoring is a cheap in-memory pass, so we score the whole
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
// with an otherwise similar score. Capped well below a single shop/category/
// keyword match so it can only ever be a tie-breaker, never override a real
// match.
const TREND_WINDOW_DAYS = 14;
const TREND_MAX_BONUS = 0.8;

// Vietnamese product titles are noisy with size/color/generic-hype words that
// would otherwise dominate the keyword overlap score (e.g. "chính hãng",
// "cao cấp" show up on nearly everything) - stripping them out leaves the
// words that actually describe *what the product is*.
const STOPWORDS = new Set([
  'va', 'cho', 'cua', 'cac', 'nhung', 'mot', 'la', 'co', 'khong', 'tai',
  'chinh', 'hang', 'cao', 'cap', 'sieu', 'gia', 're', 'moi', 'set', 'bo',
  'chiec', 'cai', 'loai', 'mau', 'size', 'combo', 'tang', 'kem', 'theo',
  'voi', 'duoc', 'nay', 'hot', 'trend', 'form', 'freeship', 'sale',
]);

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd');
}

// addlivetag and the scraper each format shop/category names slightly
// differently (e.g. trailing spaces from Shopee's own listing markup), so an
// exact-string match would silently miss real matches. Trimming and
// collapsing whitespace before using these as map keys avoids that.
function normalizeName(s) {
  return s ? s.trim().replace(/\s+/g, ' ') : s;
}

function tokenize(text) {
  if (!text) return [];
  return stripDiacritics(text.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

// Recency-weighted so the 1st most-recent link counts more than the 50th -
// a simple 1/rank harmonic decay, no tuning knobs to get wrong.
function weightAt(index) {
  return 1 / (index + 1);
}

async function fallbackProducts(limit, excludeIds = new Set()) {
  const products = await prisma.shoppingProduct.findMany({
    where: excludeIds.size ? { id: { notIn: [...excludeIds] } } : undefined,
    orderBy: [{ commissionRateValue: 'desc' }, { scrapedAt: 'desc' }],
    take: limit,
  });
  return products;
}

// Builds the per-user weight maps off "Tạo link" history - the shared input
// to scoreProduct() below. Extracted out of recommendForUser so the same
// affinity can drive both the Home-tab "Gợi ý cho bạn" widget and the
// Shopping-tab personalized ordering, without scoring twice differently.
async function buildAffinity(userId) {
  const [links, recentSearchTerms] = await Promise.all([
    prisma.link.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: 'desc' },
      take: LINK_HISTORY_LIMIT,
    }),
    searchHistoryRepo.recentTerms(userId),
  ]);

  const withSignal = links.filter((l) => l.catName || l.shopName || l.itemName);
  if (withSignal.length === 0 && recentSearchTerms.length === 0) {
    return { hasSignal: false, alreadyLinkedItemIds: new Set() };
  }

  const alreadyLinkedItemIds = new Set(links.map((l) => l.itemId).filter(Boolean));
  const catWeights = new Map();
  const shopWeights = new Map();
  const keywordWeights = new Map();
  const prices = [];

  withSignal.forEach((link, index) => {
    const weight = weightAt(index);
    const catName = normalizeName(link.catName);
    const shopName = normalizeName(link.shopName);
    if (catName) catWeights.set(catName, (catWeights.get(catName) || 0) + weight);
    if (shopName) shopWeights.set(shopName, (shopWeights.get(shopName) || 0) + weight);
    for (const token of tokenize(link.itemName)) {
      keywordWeights.set(token, (keywordWeights.get(token) || 0) + weight);
    }
    for (const token of tokenize(link.catName)) {
      keywordWeights.set(token, (keywordWeights.get(token) || 0) + weight * 0.5);
    }
    if (link.priceValue != null) prices.push(link.priceValue);
  });

  recentSearchTerms.forEach((term, index) => {
    const weight = weightAt(index) * SEARCH_TERM_WEIGHT;
    for (const token of tokenize(term)) {
      keywordWeights.set(token, (keywordWeights.get(token) || 0) + weight);
    }
  });

  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  // Wide-ish band (0.4x-2.5x average) - this is a soft nudge, not a filter,
  // so it shouldn't hide otherwise-good matches over a modest price gap.
  const priceLow = avgPrice != null ? avgPrice * 0.4 : null;
  const priceHigh = avgPrice != null ? avgPrice * 2.5 : null;

  return { hasSignal: true, alreadyLinkedItemIds, catWeights, shopWeights, keywordWeights, avgPrice, priceLow, priceHigh };
}

// Same additive heuristic used by both callers: shop match (x5) + category
// match (x3) + keyword overlap (x2/token) + price-band proximity (+1) + a
// mild commission tie-breaker. Returns 0 (never negative) for a total miss,
// so callers can decide themselves whether a 0-score product gets dropped
// (Home-tab widget) or just sinks to the bottom of a still-complete list
// (Shopping-tab browse).
function scoreProduct(product, affinity) {
  if (!affinity.hasSignal) return 0;
  const { shopWeights, catWeights, keywordWeights, avgPrice, priceLow, priceHigh } = affinity;
  let score = 0;
  const productShopName = normalizeName(product.shopName);
  const productCategory = normalizeName(product.category);
  if (productShopName && shopWeights.has(productShopName)) {
    score += 5 * shopWeights.get(productShopName);
  }
  if (productCategory && catWeights.has(productCategory)) {
    score += 3 * catWeights.get(productCategory);
  }
  const overlap = tokenize(product.name).filter((token) => keywordWeights.has(token));
  for (const token of overlap) score += 2 * keywordWeights.get(token);
  if (avgPrice != null && product.priceValue != null && product.priceValue >= priceLow && product.priceValue <= priceHigh) {
    score += 1;
  }
  if (product.commissionRateValue != null) {
    score += Math.min(product.commissionRateValue / 20, 1.5);
  }
  if (product.scrapedAt) {
    const ageDays = (Date.now() - new Date(product.scrapedAt).getTime()) / 86400000;
    if (ageDays < TREND_WINDOW_DAYS) {
      score += TREND_MAX_BONUS * (1 - ageDays / TREND_WINDOW_DAYS);
    }
  }
  return score;
}

/**
 * Recommends shopping_products for a user based on their "Tạo link" history
 * (the links table) - the only per-user signal this app has, since there's no
 * browsing/wishlist tracking. Each Link row carries a best-effort content
 * snapshot (itemName/catName/shopName/priceValue) taken for free off the same
 * addlivetag commission lookup /app/link already makes (see lib/commission.js),
 * so this works even for links whose item was never scraped into the catalog -
 * unlike a plain itemId join, which would only match products we happened to
 * scrape.
 *
 * Scoring is a simple additive heuristic (shop match + category-tab match +
 * keyword overlap + price-band proximity + a mild commission tie-breaker) -
 * deliberately not ML/embeddings, so it runs with zero extra infra on top of
 * data already being collected. Users with no usable link history (new
 * accounts, or every link's lookup fell back to the browser path and missed
 * the content snapshot) get the top-commission catalog instead, so the
 * section is never empty.
 */
async function recommendForUser(userId, { limit = 10 } = {}) {
  const affinity = await buildAffinity(userId);
  if (!affinity.hasSignal) {
    return { items: await fallbackProducts(limit), reason: 'no_history' };
  }

  const { alreadyLinkedItemIds } = affinity;
  const candidates = await prisma.shoppingProduct.findMany({
    where: alreadyLinkedItemIds.size ? { productId: { notIn: [...alreadyLinkedItemIds] } } : undefined,
    orderBy: { id: 'desc' },
    take: CANDIDATE_POOL_SIZE,
  });

  const scored = candidates
    .map((product) => ({ product, score: scoreProduct(product, affinity) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit).map((entry) => entry.product);

  if (top.length < limit) {
    const usedIds = new Set(top.map((p) => p.id));
    const filler = await fallbackProducts(limit - top.length, usedIds);
    top.push(...filler);
  }

  return { items: top, reason: top.length ? 'personalized' : 'no_match' };
}

/**
 * Personalized ordering for the full Shopping-tab catalog browse (and its
 * search box): unlike recommendForUser, this never drops a product - it
 * scores the whole (optionally search-filtered) catalog and sorts matches to
 * the top, letting 0-score products sink to the bottom in their existing
 * `id desc` order rather than disappearing. Used only for the "no explicit
 * filter/sort" and "search" branches of /app/shopping-products; as soon as
 * the user sets a price/commission filter or picks a sort, the route falls
 * back to the original DB-pushdown pagination untouched.
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
      orderBy: [{ scrapedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      skip: offset,
    });
  }

  const candidates = await prisma.shoppingProduct.findMany({
    where,
    orderBy: { id: 'desc' },
    take: CANDIDATE_POOL_SIZE,
  });

  const sorted = candidates
    .map((product) => ({ product, score: scoreProduct(product, affinity) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.product);

  return sorted.slice(offset, offset + limit);
}

module.exports = { recommendForUser, rankProductsForUser, buildAffinity, scoreProduct };
