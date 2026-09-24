const shopsRepo = require('./repositories/shops');
const shopeeApi = require('./shopeeAffiliateApi');

// Shopee's own endpoint, so the budget is deliberately far smaller than the
// addlivetag jobs'. On top of the 1.2s global gate inside shopeeAffiliateApi.js.
const DEFAULT_BATCH_SIZE = parseInt(process.env.SHOP_DETAIL_BATCH_SIZE || '20', 10);
const DELAY_MS = parseInt(process.env.SHOP_DETAIL_DELAY_MS || '1500', 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fills in what a shop needs before it can be shown: avatar, cover, rating,
 * sold total, follower count and the commission rate - all from one call to
 * GET /api/v3/offer/shop?shop_id= (docs/shopee-affiliate-api-spec.txt §1.2).
 *
 * This is the other half of reading addlivetag's shop_id. That lookup creates
 * thousands of shops that have an id and a name and nothing else, and
 * shops.refreshProductCounts refuses to promote a shop with no avatar precisely
 * so those never surface as blank cards. This job is what lets them out.
 *
 * Unlike the two addlivetag jobs this talks to Shopee, so it obeys the same
 * three rules lib/shopResolution.js does: check the circuit breaker before
 * spending anything, stop the whole sweep on a block or a dead session rather
 * than working through the batch proving the same thing twenty times, and pause
 * between calls.
 */
async function enrichShopDetails({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const health = await shopeeApi.getApiHealth();
  if (health.blocked) {
    return {
      scanned: 0,
      enriched: 0,
      failed: 0,
      retryable: 0,
      error: 'shopee_blocked',
      retryAfterMs: health.retryAfterMs,
    };
  }

  const shops = await shopsRepo.listDetailQueue({ limit: batchSize });
  if (!shops.length) {
    return { scanned: 0, enriched: 0, failed: 0, retryable: 0 };
  }

  let enriched = 0;
  let failed = 0;
  let retryable = 0;
  let stopReason = null;
  const checked = [];
  const promoted = [];

  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    try {
      const detail = await shopeeApi.getShopDetail(shop.shopId);
      // applyDetail stamps both detailFetchedAt and detailCheckedAt, so this
      // shop leaves the queue outright.
      await shopsRepo.applyDetail(shop.shopId, detail);
      promoted.push(shop.shopId);
      enriched++;
    } catch (err) {
      if (err instanceof shopeeApi.BlockedError) {
        // Anti-bot. Every remaining shop would hit the same wall, and retrying
        // is what deepens a block. Leave them all unstamped.
        stopReason = 'shopee_blocked';
        retryable += shops.length - i;
        break;
      }
      if (err instanceof shopeeApi.SessionExpiredError) {
        // Needs a person (`npm run seed-login`); nothing here can fix it.
        stopReason = 'session_expired';
        retryable += shops.length - i;
        break;
      }
      // Shopee answered and simply has nothing for this shop id - stamp it so
      // it rotates to the back instead of holding the front of the queue.
      checked.push(shop.shopId);
      failed++;
    }
    if (i < shops.length - 1) await sleep(DELAY_MS);
  }

  if (checked.length) {
    await shopsRepo.markDetailChecked(checked);
  }

  // Shops that just gained an avatar can now be promoted to 'linked' if they
  // have products - that gate lives in refreshProductCounts.
  if (promoted.length) {
    await shopsRepo.refreshProductCounts(promoted);
  }

  return {
    scanned: shops.length,
    enriched,
    failed,
    retryable,
    ...(stopReason ? { error: stopReason } : {}),
  };
}

module.exports = { enrichShopDetails };
