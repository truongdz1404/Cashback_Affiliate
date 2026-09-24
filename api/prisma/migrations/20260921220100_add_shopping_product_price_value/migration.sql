-- AlterTable
ALTER TABLE "shopping_products" ADD COLUMN     "price_value" INTEGER;

-- CreateIndex
CREATE INDEX "shopping_products_price_value_idx" ON "shopping_products"("price_value");
