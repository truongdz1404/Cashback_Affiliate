const prisma = require('../prisma');

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
  const links = await prisma.link.findMany({
    where: { userId: Number(userId) },
    orderBy: { createdAt: 'desc' },
    take: LINK_HISTORY_LIMIT,
  });

  const withSignal = links.filter((l) => l.catName || l.shopName || l.itemName);
  if (withSignal.length === 0) {
    return { items: await fallbackProducts(limit), reason: 'no_history' };
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

  const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  // Wide-ish band (0.4x-2.5x average) - this is a soft nudge, not a filter,
  // so it shouldn't hide otherwise-good matches over a modest price gap.
  const priceLow = avgPrice != null ? avgPrice * 0.4 : null;
  const priceHigh = avgPrice != null ? avgPrice * 2.5 : null;

  const candidates = await prisma.shoppingProduct.findMany({
    where: alreadyLinkedItemIds.size ? { productId: { notIn: [...alreadyLinkedItemIds] } } : undefined,
    orderBy: { id: 'desc' },
    take: CANDIDATE_POOL_SIZE,
  });

  const scored = candidates
    .map((product) => {
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
      return { product, score };
    })
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

module.exports = { recommendForUser };
