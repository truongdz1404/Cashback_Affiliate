-- Shops in Shopee's affiliate programme, plus the queue that maps a product's
-- free-text shop_name onto one of them. See prisma/schema.prisma for why
-- shop_id (Shopee's own id) is the FK target rather than the autoincrement id.
--
-- Online safety: "shopping_products"."shop_id" is a nullable ADD COLUMN with no
-- default, which is metadata-only on PG 11+ (instant, no table rewrite). The two
-- CREATE INDEXes on shopping_products do take a write lock while they build, and
-- cannot use CONCURRENTLY because `prisma migrate deploy` runs a migration inside
-- a transaction - but scripts/start-xvfb.sh:27 runs the deploy BEFORE node
-- server.js, so nothing is writing at that point, and the table is in the tens of
-- thousands of rows (529 locally), not millions.

CREATE TABLE "shops" (
    "id" SERIAL NOT NULL,
    "shop_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "image_url" TEXT,
    "portrait_url" TEXT,
    "cover_url" TEXT,
    "shop_url" TEXT,
    "long_link" TEXT,
    "commission_rate_text" TEXT,
    "commission_rate_value" DOUBLE PRECISION,
    "period_start_time" TIMESTAMP(3),
    "period_end_time" TIMESTAMP(3),
    "offer_type" INTEGER,
    "banner_count" INTEGER,
    "rating" DOUBLE PRECISION,
    "sold_total" INTEGER,
    "follower_count" INTEGER,
    "followers_text" TEXT,
    "product_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'name_search',
    "detail_fetched_at" TIMESTAMP(3),
    "last_crawled_at" TIMESTAMP(3),
    "last_crawl_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shop_name_resolutions" (
    "id" SERIAL NOT NULL,
    "shop_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "shop_id" TEXT,
    "candidates_json" TEXT,
    "product_count" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_attempt_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_name_resolutions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shops_shop_id_key" ON "shops"("shop_id");
CREATE INDEX "shops_status_product_count_idx" ON "shops"("status", "product_count");
CREATE INDEX "shops_is_featured_sort_order_idx" ON "shops"("is_featured", "sort_order");
CREATE INDEX "shops_last_crawled_at_idx" ON "shops"("last_crawled_at");

CREATE UNIQUE INDEX "shop_name_resolutions_shop_name_key" ON "shop_name_resolutions"("shop_name");
CREATE INDEX "shop_name_resolutions_status_next_attempt_at_idx" ON "shop_name_resolutions"("status", "next_attempt_at");

ALTER TABLE "shopping_products" ADD COLUMN "shop_id" TEXT;

CREATE INDEX "shopping_products_shop_id_idx" ON "shopping_products"("shop_id");
CREATE INDEX "shopping_products_shop_name_idx" ON "shopping_products"("shop_name");

ALTER TABLE "shopping_products" ADD CONSTRAINT "shopping_products_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "shop_name_resolutions" ADD CONSTRAINT "shop_name_resolutions_shop_id_fkey"
    FOREIGN KEY ("shop_id") REFERENCES "shops"("shop_id") ON DELETE SET NULL ON UPDATE CASCADE;
