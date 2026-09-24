-- Nullable, no default: metadata-only on PG11+, so the ADD COLUMN is instant.
ALTER TABLE "shopping_products" ADD COLUMN "category_checked_at" TIMESTAMP(3);

CREATE INDEX "shopping_products_category_category_checked_at_idx"
  ON "shopping_products"("category", "category_checked_at");
