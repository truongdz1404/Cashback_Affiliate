const prisma = require('./prisma');
const { getCommissionBatchViaApi } = require('./commission');
const { mapMetaToProductFields } = require('./shoppingProductMapper');

// addlivetag's product-data-batch.php caps at 100 item_ids per request and
// its own docs recommend trickling max_api (items allowed to hit the live
// source, vs. served from its cache) on a cold cache instead of dumping a
// huge batch - every row this job selects is cold by definition (category
// is only ever null before its first successful lookup), so batchSize also
// doubles as the max_api value we request.
const DEFAULT_BATCH_SIZE = 30;

/**
 * Backfills `category` on catalog rows that don't have one - either left
 * over from the migration that cleared the old tab-derived value (see
 * prisma/migrations/20260922120000_split_shopping_product_category) or an
 * admin CSV/XLSX import (lib/shoppingProductImport.js), which never had a
 * category at all. Runs on a cron schedule (server.js) in small batches via
 * the batch endpoint rather than looping the single-item one - a miss here
 * just gets retried next run (same rows resurface since they stay
 * category: null), so it isn't worth spending a scarce Playwright page (the
 * VPS's warm custom-link pool, see browserManager.js) on the fallback.
 */
async function backfillMissingCategories({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const products = await prisma.shoppingProduct.findMany({
    where: { category: null },
    orderBy: { scrapedAt: 'asc' },
    take: batchSize,
  });

  if (!products.length) {
    return { scanned: 0, updated: 0, failed: 0, retryable: 0 };
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
    return { scanned: products.length, updated: 0, failed: 0, retryable: products.length, error: err.message };
  }

  let updated = 0;
  let failed = 0;
  let retryable = 0;

  for (const product of products) {
    const entry = byItemId.get(String(product.productId));

    // Not attempted this round (api budget/source cooldown/time budget) or a
    // stale-but-unusable shape - leave category null so the next run retries.
    if (!entry || (entry.status !== 'success' && entry.status !== 'stale')) {
      retryable++;
      continue;
    }

    const fields = mapMetaToProductFields(entry.meta, entry.commissionTable);
    if (!fields.category) {
      // addlivetag itself doesn't know this product's category either -
      // leave category null so the next run picks it up again.
      failed++;
      continue;
    }

    await prisma.shoppingProduct.update({
      where: { id: product.id },
      data: {
        category: fields.category,
        isXtraCommission: fields.isXtraCommission ?? product.isXtraCommission,
        shopName: product.shopName ?? fields.shopName ?? null,
        priceValue: product.priceValue ?? fields.priceValue ?? null,
        imageUrl: product.imageUrl ?? fields.imageUrl ?? null,
      },
    });
    updated++;
  }

  return {
    scanned: products.length,
    updated,
    failed,
    retryable,
    sourceRateLimited: batchInfo.limits?.sourceRateLimited ?? false,
    sourceCooldownSeconds: batchInfo.limits?.sourceCooldownSeconds ?? 0,
  };
}

module.exports = { backfillMissingCategories };
