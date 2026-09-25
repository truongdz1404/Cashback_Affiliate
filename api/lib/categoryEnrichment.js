const prisma = require('./prisma');
const { getCommissionBatchViaApi } = require('./commission');
const { mapMetaToProductFields } = require('./shoppingProductMapper');
const shoppingProductsRepo = require('./repositories/shoppingProducts');
const shopsRepo = require('./repositories/shops');

// addlivetag's product-data-batch.php caps at 100 item_ids per request and
// its own docs recommend trickling max_api (items allowed to hit the live
// source, vs. served from its cache) on a cold cache instead of dumping a
// huge batch - every row this job selects is cold by definition (category
// is only ever null before its first successful lookup), so batchSize also
// doubles as the max_api value we request.
const DEFAULT_BATCH_SIZE = 30;

// How long a row addlivetag answered about but couldn't classify sits out
// before being asked again. Long, because the answer rarely changes - this is
// a slow second chance for products that get a taxonomy later, not a retry.
const RECHECK_AFTER_DAYS = 7;

/**
 * Backfills `category` on catalog rows that don't have one - either left
 * over from the migration that cleared the old tab-derived value (see
 * prisma/migrations/20260922120000_split_shopping_product_category) or an
 * admin CSV/XLSX import (lib/shoppingProductImport.js), which never had a
 * category at all. Runs on a cron schedule (server.js) in small batches via
 * the batch endpoint rather than looping the single-item one - it isn't worth
 * spending a scarce Playwright page (the VPS's warm custom-link pool, see
 * browserManager.js) on the fallback.
 *
 * The queue is "category IS NULL, least recently asked about first". It is
 * deliberately NOT just "category IS NULL": that version took the same oldest
 * N rows every tick, so rows addlivetag can't classify parked themselves at
 * the head and starved everything behind them. Stamping `categoryCheckedAt`
 * on every row the source actually answered for - classified or not - is what
 * makes the queue drain. Rows the source never got to (budget exhausted,
 * cooldown, outage) are left unstamped so they keep their place.
 */
async function backfillMissingCategories({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const recheckBefore = new Date(Date.now() - RECHECK_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const products = await prisma.shoppingProduct.findMany({
    where: {
      category: null,
      OR: [{ categoryCheckedAt: null }, { categoryCheckedAt: { lt: recheckBefore } }],
    },
    orderBy: [{ categoryCheckedAt: { sort: 'asc', nulls: 'first' } }, { scrapedAt: 'asc' }],
    take: batchSize,
  });

  if (!products.length) {
    return { scanned: 0, updated: 0, failed: 0, retryable: 0, shopsLinked: 0 };
  }

  let byItemId;
  let batchInfo;
  try {
    const result = await getCommissionBatchViaApi(
      products.map((p) => p.productId),
      { maxApi: batchSize }
    );
    byItemId = result.byItemId;
    batchInfo = { summary: result.summary, limits: result.limits };
  } catch (err) {
    return {
      scanned: products.length,
      updated: 0,
      failed: 0,
      retryable: products.length,
      shopsLinked: 0,
      error: err.message,
    };
  }

  const checkedAt = new Date();
  let updated = 0;
  let failed = 0;
  let retryable = 0;
  let shopsLinked = 0;
  const answeredButUnclassified = [];
  const touchedShopIds = new Set();

  for (const product of products) {
    const entry = byItemId.get(String(product.productId));

    // Not attempted this round (api budget/source cooldown/time budget) or a
    // stale-but-unusable shape - leave category null AND leave the stamp
    // alone, so this row keeps its place at the front of the queue.
    if (!entry || (entry.status !== 'success' && entry.status !== 'stale')) {
      retryable++;
      continue;
    }

    const fields = mapMetaToProductFields(entry.meta, entry.commissionTable);

    // The same payload that carries the category carries the shop id, so a row
    // that has no shop yet gets attributed here for free - no extra request to
    // anyone. lib/shopLinkBackfill.js is the job that sweeps the rest; this just
    // happens to be holding the answer already.
    let shopId;
    if (!product.shopId) {
      shopId = await shoppingProductsRepo.ensureShopLink(fields);
      if (shopId) {
        touchedShopIds.add(shopId);
        shopsLinked++;
      }
    }

    if (!fields.category) {
      // addlivetag answered and genuinely has no taxonomy for this product.
      // Stamp it so it rotates to the back instead of jamming the queue. The
      // shop still gets written if one was found - the two are independent, and
      // a product with a shop but no category is worth more than neither.
      if (shopId) {
        await prisma.shoppingProduct.update({ where: { id: product.id }, data: { shopId } });
      }
      answeredButUnclassified.push(product.id);
      failed++;
      continue;
    }

    await prisma.shoppingProduct.update({
      where: { id: product.id },
      data: {
        category: fields.category,
        categoryCheckedAt: checkedAt,
        ...(shopId ? { shopId } : {}),
        isXtraCommission: fields.isXtraCommission ?? product.isXtraCommission,
        shopName: product.shopName ?? fields.shopName ?? null,
        priceValue: product.priceValue ?? fields.priceValue ?? null,
        imageUrl: product.imageUrl ?? fields.imageUrl ?? null,
      },
    });
    updated++;
  }

  if (answeredButUnclassified.length) {
    await prisma.shoppingProduct.updateMany({
      where: { id: { in: answeredButUnclassified } },
      data: { categoryCheckedAt: checkedAt },
    });
  }

  if (touchedShopIds.size) {
    await shopsRepo.refreshProductCounts([...touchedShopIds]);
  }

  return {
    scanned: products.length,
    updated,
    failed,
    retryable,
    shopsLinked,
    sourceRateLimited: batchInfo.limits?.sourceRateLimited ?? false,
    sourceCooldownSeconds: batchInfo.limits?.sourceCooldownSeconds ?? 0,
    // What addlivetag says it has left to answer with this window. Carried
    // through only so a stalled sweep says WHY in job_runs: a batch that comes
    // back all-retryable looks identical whether the source is down, the live
    // budget is spent, or the rows are genuinely unanswerable.
    apiRemaining: batchInfo.limits?.apiRemaining ?? null,
    dbRemaining: batchInfo.limits?.dbRemaining ?? null,
  };
}

module.exports = { backfillMissingCategories };
