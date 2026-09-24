const prisma = require('./prisma');
const shopsRepo = require('./repositories/shops');
const resolutionsRepo = require('./repositories/shopNameResolutions');
const shopeeApi = require('./shopeeAffiliateApi');

// Maps ShoppingProduct.shopName (a plain text column, all we get from the
// product-offer CSV) onto a real Shop row, using Shopee's own shop search -
// see docs/shopee-affiliate-api-spec.txt §1.1.
//
// Shaped after lib/categoryEnrichment.js (small batches on a cron, counters
// returned rather than logged), with one deliberate difference: the queue is a
// real table, not "the column is still NULL". A shop name that isn't in the
// affiliate programme will NEVER match, and re-asking Shopee about it every ten
// minutes forever is the fastest way to lose the affiliate account. See the
// model comment in prisma/schema.prisma and lib/repositories/shopNameResolutions.js.

const DEFAULT_BATCH_SIZE = parseInt(process.env.SHOP_RESOLVE_BATCH_SIZE || '10', 10);
const DISCOVERY_LIMIT = parseInt(process.env.SHOP_RESOLVE_DISCOVERY_LIMIT || '200', 10);
// On top of the 1.2s global gate inside lib/shopeeAffiliateApi.js. Belt and
// braces on the one endpoint the spec (§8) warns could be locked down next.
const DELAY_MS = parseInt(process.env.SHOP_RESOLVE_DELAY_MS || '2000', 10);
const FETCH_DETAIL = process.env.SHOP_FETCH_DETAIL !== 'false';
const DETAIL_TTL_MS = parseInt(process.env.SHOP_DETAIL_TTL_DAYS || '7', 10) * 24 * 3600 * 1000;
const BLOCKED_COOLDOWN_MS = parseInt(process.env.SHOP_RESOLVE_BLOCKED_COOLDOWN_MS || '1800000', 10);
// A dead cookie needs a human (`npm run seed-login`), and nothing this job does
// will fix it. Park the name so the next cron tick doesn't spend another call
// proving the same thing.
const SESSION_COOLDOWN_MS = parseInt(process.env.SHOP_RESOLVE_SESSION_COOLDOWN_MS || '1800000', 10);
// candidatesJson exists so an admin can pick the right shop by hand for an
// `ambiguous` row. Twenty entries is more than enough for that; the raw search
// payload is far too big to keep one copy of per shop name.
const MAX_CANDIDATES_STORED = 20;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * THE matching rule, and the single most important line in this file.
 *
 * Exact string equality, only surrounding whitespace trimmed: no lowercasing,
 * no diacritic stripping, no "Official Store" suffix trimming. Shopee returns
 * the shop name in `offer/shop/list` byte-for-byte the same as it puts it in
 * the product CSV's "Tên cửa hàng" column, so anything looser only buys wrong
 * matches - and attaching products to the wrong merchant is worse than leaving
 * them unattached, because it silently sends a user's cashback elsewhere.
 *
 * Two shops genuinely sharing a display name is handled upstream (`ambiguous`),
 * never by taking list[0].
 */
function exactMatches(candidates, shopName) {
  const target = String(shopName || '').trim();
  if (!target) return [];
  return candidates.filter((c) => String(c.shop_name || '').trim() === target);
}

/**
 * Spec §1.1: the search is substring-based but NOT monotonic - a longer keyword
 * can return FEWER results ("Vinamilk" finds 5 shops, "Vinamilk Official Store"
 * finds 0). So a miss on the full name is retried once with a shorter keyword.
 *
 * This widens the SEARCH only. The comparison above stays exact either way.
 */
function shortenKeyword(shopName) {
  const tokens = String(shopName || '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return null;
  let short = tokens.slice(0, 3).join(' ');
  if (short.length > 32) short = short.slice(0, 32).trim();
  return short && short !== String(shopName).trim() ? short : null;
}

function compactCandidates(candidates) {
  return candidates.slice(0, MAX_CANDIDATES_STORED).map((c) => ({
    shop_id: c.shop_id == null ? null : String(c.shop_id),
    shop_name: c.shop_name || null,
    shop_image: c.shop_image || null,
    commission_rate: c.commission_rate || null,
  }));
}

/**
 * Discovers shop names that still have no shop, ordered by how many products
 * carry them - resolving the biggest name first covers the most catalogue per
 * API call. Idempotent: `skipDuplicates` means a name that is already resolved,
 * ambiguous or parked is left exactly as it is.
 *
 * This queue shrinks on its own now, and that is deliberate. Every product
 * lookup carries Shopee's shop_id for free (lib/commission.js), so
 * lib/shopLinkBackfill.js attributes products without asking Shopee anything,
 * and anything it attributes disappears from the `shopId: null` group below.
 * What is left is the case no product lookup can cover: shops that have no
 * products here at all. Searching by name is the only way to find those, which
 * is why this job stays - on a much smaller queue, spending far fewer calls
 * against the one endpoint the spec (§8) warns could be locked down.
 */
async function discoverShopNames({ limit = DISCOVERY_LIMIT } = {}) {
  const grouped = await prisma.shoppingProduct.groupBy({
    by: ['shopName'],
    where: { shopId: null, shopName: { not: null } },
    _count: { shopName: true },
    orderBy: { _count: { shopName: 'desc' } },
    take: limit,
  });

  const rows = grouped
    .map((g) => ({ shopName: String(g.shopName || '').trim(), productCount: g._count.shopName }))
    .filter((r) => r.shopName);

  if (!rows.length) return { seen: 0, created: 0 };
  const created = await resolutionsRepo.upsertPending(rows);
  // Keeps the queue ordered by real impact instead of by whatever the count
  // happened to be the day the name was first seen.
  await resolutionsRepo.refreshCounts(rows);
  return { seen: rows.length, created };
}

/**
 * Stores every shop the search returned, not just the one that matched.
 *
 * Each search is a free shop discovery: a keyword pulls back everything whose
 * name contains it, and those extras are real shops with a real shop_id that an
 * admin may well want to crawl later. They are saved with the default
 * `discovered` status, which keeps them out of the app entirely until they
 * actually have products (lib/repositories/shops.js VISIBLE_WHERE).
 */
async function saveCandidates(candidates) {
  const ids = candidates.map((c) => (c.shop_id == null ? null : String(c.shop_id))).filter(Boolean);
  if (!ids.length) return { saved: 0, created: 0 };

  const before = new Set(await shopsRepo.existingShopIds(ids));
  let saved = 0;
  for (const candidate of candidates) {
    const shop = await shopsRepo.upsertFromApi(candidate, { source: 'name_search' });
    if (shop) saved++;
  }
  return { saved, created: ids.filter((id) => !before.has(id)).length };
}

/**
 * Buys rating / sold_total / follower_count, which the list endpoint doesn't
 * carry. Optional (SHOP_FETCH_DETAIL) because it doubles this job's API budget
 * and the avatar - the only field the UI truly needs - already came with the
 * search result.
 */
async function maybeFetchDetail(shopId) {
  if (!FETCH_DETAIL) return false;
  const shop = await shopsRepo.getByShopId(shopId);
  if (!shop) return false;
  if (shop.detailFetchedAt && Date.now() - new Date(shop.detailFetchedAt).getTime() < DETAIL_TTL_MS) {
    return false;
  }
  const detail = await shopeeApi.getShopDetail(shopId);
  await shopsRepo.applyDetail(shopId, detail);
  return true;
}

/**
 * Resolves one queued shop name. Returns an outcome rather than throwing, so
 * the batch loop can decide whether to carry on - except for the two errors
 * that mean "stop touching Shopee right now", which come back as outcomes of
 * their own (`retryable` / `session_expired`) and end the sweep.
 *
 * @returns {{outcome:string, productsLinked:number, shopsSaved:number, shopsCreated:number, shopId?:string, detailFetched?:boolean, error?:string}}
 */
async function resolveRow(row) {
  const shopName = String(row.shopName || '').trim();
  const result = { outcome: 'not_found', productsLinked: 0, shopsSaved: 0, shopsCreated: 0 };

  let candidates;
  try {
    candidates = await shopeeApi.searchShopsByKeyword(shopName);
  } catch (err) {
    return handleApiError(err, result);
  }

  let matches = exactMatches(candidates, shopName);

  // Miss on the full name - try the shorter keyword once (see shortenKeyword).
  if (!matches.length) {
    const short = shortenKeyword(shopName);
    if (short) {
      try {
        const wider = await shopeeApi.searchShopsByKeyword(short);
        // Merge by shop_id so the stored candidate list shows an admin
        // everything both searches turned up, not just the second one.
        const seen = new Set(candidates.map((c) => String(c.shop_id)));
        for (const c of wider) {
          if (!seen.has(String(c.shop_id))) {
            candidates.push(c);
            seen.add(String(c.shop_id));
          }
        }
        matches = exactMatches(candidates, shopName);
      } catch (err) {
        return handleApiError(err, result);
      }
    }
  }

  const saved = await saveCandidates(candidates);
  result.shopsSaved = saved.saved;
  result.shopsCreated = saved.created;
  const candidatesJson = JSON.stringify(compactCandidates(candidates));

  if (matches.length > 1) {
    await resolutionsRepo.markAmbiguous(row.id, { candidatesJson });
    result.outcome = 'ambiguous';
    return result;
  }

  if (matches.length === 0) {
    await resolutionsRepo.markNotFound(row.id, { candidatesJson });
    result.outcome = 'not_found';
    return result;
  }

  const shopId = String(matches[0].shop_id);
  await shopsRepo.markLinked(shopId);
  await resolutionsRepo.markResolved(row.id, { shopId, candidatesJson });
  result.outcome = 'resolved';
  result.shopId = shopId;

  // The write-back, in one statement. `shopId: null` keeps it from touching a
  // product that some other pass (the per-shop crawler) already attributed.
  const { count } = await prisma.shoppingProduct.updateMany({
    where: { shopName, shopId: null },
    data: { shopId },
  });
  result.productsLinked = count;

  try {
    result.detailFetched = await maybeFetchDetail(shopId);
  } catch (err) {
    // The name is resolved and the products are linked; rating and follower
    // count are garnish. Only the two "stop now" errors change what the sweep
    // does next, and those are reported through the outcome.
    if (err instanceof shopeeApi.BlockedError || err instanceof shopeeApi.SessionExpiredError) {
      result.outcome = err instanceof shopeeApi.BlockedError ? 'resolved_then_blocked' : 'resolved_then_expired';
    }
    result.error = `${err.name}: ${err.message}`;
  }

  return result;
}

function handleApiError(err, result) {
  if (err instanceof shopeeApi.BlockedError) {
    return { ...result, outcome: 'blocked', error: `${err.name}: ${err.message}`, retryAfterMs: err.retryAfterMs };
  }
  if (err instanceof shopeeApi.SessionExpiredError) {
    return { ...result, outcome: 'session_expired', error: `${err.name}: ${err.message}` };
  }
  return { ...result, outcome: 'error', error: `${err.name}: ${err.message}` };
}

/**
 * One sweep: discover new names, then work a small batch of them one at a time.
 *
 * Never Promise.all - every call shares one budget against one anti-bot-sensitive
 * endpoint, and parallelism here buys nothing except a faster way to get blocked.
 *
 * @returns counters in the same family as backfillMissingCategories().
 */
async function resolvePendingShopNames({ batchSize = DEFAULT_BATCH_SIZE, discoveryLimit = DISCOVERY_LIMIT } = {}) {
  const counters = {
    scanned: 0,
    resolved: 0,
    ambiguous: 0,
    notFound: 0,
    failed: 0,
    retryable: 0,
    productsLinked: 0,
    shopsCreated: 0,
    shopsSeen: 0,
    namesDiscovered: 0,
    detailsFetched: 0,
  };

  // The circuit breaker is already open - don't even build the queue.
  const health = await shopeeApi.getApiHealth();
  if (health.blocked) {
    return { ...counters, error: 'shopee_blocked', retryAfterMs: health.retryAfterMs };
  }

  const discovery = await discoverShopNames({ limit: discoveryLimit });
  counters.namesDiscovered = discovery.created;

  const rows = await resolutionsRepo.claimBatch({ limit: batchSize });
  if (!rows.length) return counters;

  const touchedShopIds = [];
  let stopReason = null;

  for (const row of rows) {
    counters.scanned++;
    const outcome = await resolveRow(row);
    counters.shopsSeen += outcome.shopsSaved;
    counters.shopsCreated += outcome.shopsCreated;
    counters.productsLinked += outcome.productsLinked;
    if (outcome.detailFetched) counters.detailsFetched++;
    if (outcome.shopId) touchedShopIds.push(outcome.shopId);

    switch (outcome.outcome) {
      case 'resolved':
      case 'resolved_then_blocked':
      case 'resolved_then_expired':
        counters.resolved++;
        break;
      case 'ambiguous':
        counters.ambiguous++;
        break;
      case 'not_found':
        counters.notFound++;
        break;
      case 'blocked':
        // Stays `pending` and does NOT burn an attempt: being blocked says
        // nothing about this particular name, and spending its attempt budget
        // would eventually park names that resolve perfectly well.
        counters.retryable++;
        await resolutionsRepo.markRetryable(row.id, {
          cooldownMs: outcome.retryAfterMs || BLOCKED_COOLDOWN_MS,
          error: outcome.error,
        });
        break;
      case 'session_expired':
        counters.retryable++;
        await resolutionsRepo.markRetryable(row.id, {
          cooldownMs: SESSION_COOLDOWN_MS,
          error: outcome.error,
        });
        break;
      default:
        counters.failed++;
        await resolutionsRepo.markError(row.id, { attempts: row.attempts, error: outcome.error });
        break;
    }

    if (outcome.outcome === 'blocked' || outcome.outcome === 'resolved_then_blocked') {
      stopReason = 'shopee_blocked';
      break;
    }
    if (outcome.outcome === 'session_expired' || outcome.outcome === 'resolved_then_expired') {
      // Needs a human with `npm run seed-login`; log loudly rather than
      // leaving it to be noticed in a counter nobody reads.
      console.error(`[shop-resolve] phiên Shopee đã hết hạn: ${outcome.error}`);
      stopReason = 'session_expired';
      break;
    }

    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  // Scoped to the shops this sweep touched - a full rebuild would scan the
  // whole product table every ten minutes for nothing.
  if (touchedShopIds.length) await shopsRepo.refreshProductCounts(touchedShopIds);

  return stopReason ? { ...counters, error: stopReason } : counters;
}

/**
 * The manual path: resolve exactly one name now, creating its queue row if this
 * name has never been seen (an admin may type a name that no product carries
 * yet). Bypasses `nextAttemptAt`, which is the whole point of a manual run -
 * but still honours the circuit breaker.
 */
async function resolveShopNameNow(shopName) {
  const name = String(shopName || '').trim();
  if (!name) throw new Error('shopName rỗng');

  const health = await shopeeApi.getApiHealth();
  if (health.blocked) {
    throw new shopeeApi.BlockedError('cầu dao đang mở', { retryAfterMs: health.retryAfterMs });
  }

  let row = await resolutionsRepo.getByShopName(name);
  if (!row) {
    await resolutionsRepo.upsertPending([{ shopName: name, productCount: 0 }]);
    row = await resolutionsRepo.getByShopName(name);
  }

  const outcome = await resolveRow(row);
  if (outcome.outcome === 'ambiguous' || outcome.outcome === 'not_found' || outcome.outcome.startsWith('resolved')) {
    if (outcome.shopId) await shopsRepo.refreshProductCounts([outcome.shopId]);
  } else if (outcome.outcome === 'blocked') {
    await resolutionsRepo.markRetryable(row.id, {
      cooldownMs: outcome.retryAfterMs || BLOCKED_COOLDOWN_MS,
      error: outcome.error,
    });
  } else if (outcome.outcome === 'session_expired') {
    await resolutionsRepo.markRetryable(row.id, { cooldownMs: SESSION_COOLDOWN_MS, error: outcome.error });
  } else {
    await resolutionsRepo.markError(row.id, { attempts: row.attempts, error: outcome.error });
  }

  return { shopName: name, ...outcome, resolution: await resolutionsRepo.getById(row.id) };
}

/**
 * An admin breaking an `ambiguous` tie (or overriding any other row) by naming
 * the shop themselves. The chosen shop must already exist - it does, because
 * every candidate from the search was saved.
 */
async function resolveManually(id, shopId) {
  const row = await resolutionsRepo.getById(id);
  if (!row) return null;
  const shop = await shopsRepo.getByShopId(shopId);
  if (!shop) throw new Error(`không có shop nào mang shop_id ${shopId}`);

  await shopsRepo.markLinked(shop.shopId);
  await resolutionsRepo.markResolved(row.id, { shopId: shop.shopId });
  const { count } = await prisma.shoppingProduct.updateMany({
    where: { shopName: row.shopName, shopId: null },
    data: { shopId: shop.shopId },
  });
  await shopsRepo.refreshProductCounts([shop.shopId]);

  return { resolution: await resolutionsRepo.getById(row.id), shop, productsLinked: count };
}

module.exports = {
  resolvePendingShopNames,
  resolveShopNameNow,
  resolveManually,
  discoverShopNames,
  // Exposed for tests - the exact-match rule is the thing most worth pinning.
  exactMatches,
  shortenKeyword,
  DEFAULT_BATCH_SIZE,
};
