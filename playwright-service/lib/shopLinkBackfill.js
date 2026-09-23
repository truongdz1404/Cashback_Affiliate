const prisma = require('./prisma');
const { getCommissionBatchViaApi } = require('./commission');
const { mapMetaToProductFields } = require('./shoppingProductMapper');
const shopsRepo = require('./repositories/shops');

// Same ceiling and the same reasoning as lib/categoryEnrichment.js: addlivetag's
// product-data-batch.php takes at most 100 item_ids, and every row this job picks
// is cold by definition, so batchSize doubles as the max_api budget.
const DEFAULT_BATCH_SIZE = 50;

// How long a row addlivetag answered about - but had no shop id for - waits
// before being asked again. Long, because that answer almost never changes.
const RECHECK_AFTER_DAYS = 14;

/**
 * Backfills `shopId` on catalog rows that carry a shop NAME and nothing else.
 *
 * There were 3108 of them out of 4938, all from scrapes and imports that ran
 * before addlivetag's shop_id was being read (see lib/commission.js's
 * mapInfoToMeta). Every one is a product whose shop page can't be opened, that
 * can't appear under its shop, and that shows no "view shop" button.
 *
 * It costs nothing to fix: the same batch lookup the category backfill already
 * makes returns the shop id in the same payload. Shopee is never contacted, so
 * unlike the name-resolution job this needs no kill switch and no circuit
 * breaker - if addlivetag is having a bad day the batch just comes back
 * unanswered and every row keeps its place.
 *
 * The queue is "shopId IS NULL, least recently asked about first", and
 * `shopCheckedAt` is what keeps it moving: rows addlivetag answered about but
 * had no shop id for get stamped and rotate to the back. Rows it never reached
 * (budget, cooldown, outage) are left unstamped and stay at the front.
 */
async function backfillMissingShopIds({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const recheckBefore = new Date(Date.now() - RECHECK_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const products = await prisma.shoppingProduct.findMany({
    where: {
      shopId: null,
      OR: [{ shopCheckedAt: null }, { shopCheckedAt: { lt: recheckBefore } }],
    },
    orderBy: [{ shopCheckedAt: { sort: 'asc', nulls: 'first' } }, { scrapedAt: 'asc' }],
    take: batchSize,
  });

  if (!products.length) {
    return { scanned: 0, linked: 0, shopsCreated: 0, failed: 0, retryable: 0 };
  }

  let byItemId;
  let limits;
  try {
    const result = await getCommissionBatchViaApi(
      products.map((p) => p.productId),
      { maxApi: batchSize }
    );
    byItemId = result.byItemId;
    limits = result.limits;
  } catch (err) {
    return {
      scanned: products.length,
      linked: 0,
      shopsCreated: 0,
      failed: 0,
      retryable: products.length,
      error: err.message,
    };
  }

  const checkedAt = new Date();
  let linked = 0;
  let failed = 0;
  let retryable = 0;
  const shopsCreated = new Set();
  const touchedShopIds = new Set();
  const answeredButUnlinked = [];

  for (const product of products) {
    const entry = byItemId.get(String(product.productId));

    // Never attempted this round, or a shape we can't use - leave shopId null
    // AND leave the stamp alone so this row keeps its place at the front.
    if (!entry || (entry.status !== 'success' && entry.status !== 'stale')) {
      retryable++;
      continue;
    }

    const fields = mapMetaToProductFields(entry.meta, entry.commissionTable);
    if (!fields.shopId || !fields.shopName) {
      // addlivetag answered and genuinely has no shop for this product. Stamp it
      // so it rotates to the back rather than jamming the queue.
      answeredButUnlinked.push(product.id);
      failed++;
      continue;
    }

    // The shop row has to exist before the product can point at it - shop_id is
    // a foreign key. A failure here is not fatal: the product simply stays
    // unlinked and comes round again.
    let shop;
    try {
      const before = await prisma.shop.count({ where: { shopId: fields.shopId } });
      shop = await shopsRepo.ensureFromProduct({ shopId: fields.shopId, name: fields.shopName });
      if (shop && !before) shopsCreated.add(shop.shopId);
    } catch (err) {
      console.warn('shop-link-backfill: could not ensure shop', fields.shopId, err.message);
      failed++;
      answeredButUnlinked.push(product.id);
      continue;
    }
    if (!shop) {
      answeredButUnlinked.push(product.id);
      failed++;
      continue;
    }

    await prisma.shoppingProduct.update({
      where: { id: product.id },
      data: {
        shopId: shop.shopId,
        shopCheckedAt: checkedAt,
        // The name the product was scraped with stays authoritative when it has
        // one; this only fills a gap.
        shopName: product.shopName ?? fields.shopName,
      },
    });
    touchedShopIds.add(shop.shopId);
    linked++;
  }

  if (answeredButUnlinked.length) {
    await prisma.shoppingProduct.updateMany({
      where: { id: { in: answeredButUnlinked } },
      data: { shopCheckedAt: checkedAt },
    });
  }

  // Keeps the denormalised counts honest, and promotes any shop that now has
  // both products and an avatar. Scoped to the ids just touched, never a full
  // table scan.
  if (touchedShopIds.size) {
    await shopsRepo.refreshProductCounts([...touchedShopIds]);
  }

  return {
    scanned: products.length,
    linked,
    shopsCreated: shopsCreated.size,
    failed,
    retryable,
    sourceRateLimited: limits?.sourceRateLimited ?? false,
    sourceCooldownSeconds: limits?.sourceCooldownSeconds ?? 0,
  };
}

module.exports = { backfillMissingShopIds };
