-- links.shop_id: the real key to shops, alongside the shop_name text snapshot.
-- Nullable with no default, so on PG11+ this is a metadata-only ADD COLUMN.
ALTER TABLE "links" ADD COLUMN "shop_id" TEXT;

-- Backfill from the catalog: a link whose item we also scraped already knows
-- its shop. Links minted for a shop rather than an item (POST /app/shops/:id
-- /open) carry no item_id and are matched by their canonical storefront url
-- instead. Everything else stays NULL - a pasted link to a product outside
-- our catalog genuinely has no shop we can name.
UPDATE "links" l
   SET "shop_id" = p."shop_id"
  FROM "shopping_products" p
 WHERE l."item_id" = p."product_id"
   AND p."shop_id" IS NOT NULL
   AND l."shop_id" IS NULL;

UPDATE "links" l
   SET "shop_id" = s."shop_id"
  FROM "shops" s
 WHERE l."item_id" IS NULL
   AND l."shopee_url" = 'https://shopee.vn/shop/' || s."shop_id"
   AND l."shop_id" IS NULL;

ALTER TABLE "links" ADD CONSTRAINT "links_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hot-path indexes. links, orders, withdrawal_requests and clawback_flags had
-- none at all beyond their primary/unique keys, so every "this user's rows,
-- newest first" read - which is what the app's home, wallet, order list and
-- every recommendation request do - was a sequential scan plus a sort.
CREATE INDEX "links_user_id_created_at_idx" ON "links"("user_id", "created_at");
CREATE INDEX "links_user_id_item_id_idx" ON "links"("user_id", "item_id");
CREATE INDEX "links_shop_id_idx" ON "links"("shop_id");

CREATE INDEX "orders_user_id_id_idx" ON "orders"("user_id", "id");
CREATE INDEX "orders_payout_status_idx" ON "orders"("payout_status");
CREATE INDEX "orders_sub_id_idx" ON "orders"("sub_id");

CREATE INDEX "withdrawal_requests_user_id_id_idx" ON "withdrawal_requests"("user_id", "id");
CREATE INDEX "withdrawal_requests_status_idx" ON "withdrawal_requests"("status");

CREATE INDEX "clawback_flags_resolved_at_idx" ON "clawback_flags"("resolved_at");
