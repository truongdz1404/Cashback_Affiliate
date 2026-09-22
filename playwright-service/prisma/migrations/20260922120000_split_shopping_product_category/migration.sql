-- AlterTable
ALTER TABLE "shopping_products" ADD COLUMN     "source_tab" TEXT,
ADD COLUMN     "is_best_seller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_xtra_commission" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the old tab-derived value as a raw audit trail before repurposing
-- "category" to hold only real Shopee taxonomy going forward.
UPDATE "shopping_products" SET "source_tab" = "category" WHERE "category" IS NOT NULL;

-- Known pseudo-tags that used to live in "category" become their own flags.
UPDATE "shopping_products" SET "is_best_seller" = true WHERE "category" ILIKE '%bán chạy%';
UPDATE "shopping_products" SET "is_xtra_commission" = true WHERE "category" ILIKE '%xtra%';

-- "category" itself is cleared so it can be repopulated exclusively from
-- addlivetag's real catName (lib/categoryEnrichment.js's backfill job and
-- lib/repositories/shoppingProducts.js's ensureExists), matching the source
-- Link.catName already uses.
UPDATE "shopping_products" SET "category" = NULL;
