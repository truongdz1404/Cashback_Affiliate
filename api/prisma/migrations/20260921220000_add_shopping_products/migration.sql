-- CreateTable
CREATE TABLE "shopping_products" (
    "id" SERIAL NOT NULL,
    "product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price_text" TEXT,
    "revenue_text" TEXT,
    "shop_name" TEXT,
    "commission_rate_text" TEXT,
    "commission_text" TEXT,
    "product_url" TEXT,
    "offer_url" TEXT,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shopping_products_product_id_key" ON "shopping_products"("product_id");
