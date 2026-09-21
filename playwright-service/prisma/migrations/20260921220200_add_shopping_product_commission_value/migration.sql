-- AlterTable
ALTER TABLE "shopping_products" ADD COLUMN     "commission_rate_value" DOUBLE PRECISION,
ADD COLUMN     "commission_value" INTEGER;

-- CreateIndex
CREATE INDEX "shopping_products_commission_value_idx" ON "shopping_products"("commission_value");
