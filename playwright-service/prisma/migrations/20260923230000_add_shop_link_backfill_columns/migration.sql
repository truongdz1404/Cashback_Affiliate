-- Two "when did we last ask" stamps for the shop-attribution jobs.
--
-- shopping_products.shop_checked_at drives lib/shopLinkBackfill.js (which asks
-- addlivetag for the shop id of rows that only have a shop name), and
-- shops.detail_checked_at drives lib/shopDetailEnrichment.js (which fetches a
-- shop's avatar, rating and follower count). Both are the same idea as
-- category_checked_at: without them the rows the source can't answer about park
-- themselves at the head of the queue and starve everything behind.
--
-- Nullable with no default, so both ADD COLUMNs are metadata-only on PG11+ and
-- take no table rewrite. The two indexes lock writes while they build; the
-- container runs `prisma migrate deploy` before the service starts, so nothing
-- is writing at that point.

ALTER TABLE "shopping_products" ADD COLUMN "shop_checked_at" TIMESTAMP(3);
ALTER TABLE "shops" ADD COLUMN "detail_checked_at" TIMESTAMP(3);

CREATE INDEX "shopping_products_shop_id_shop_checked_at_idx" ON "shopping_products"("shop_id", "shop_checked_at");
CREATE INDEX "shops_detail_fetched_at_detail_checked_at_idx" ON "shops"("detail_fetched_at", "detail_checked_at");
