-- AlterTable
ALTER TABLE "links" ADD COLUMN     "item_name" TEXT,
ADD COLUMN     "cat_id" INTEGER,
ADD COLUMN     "cat_name" TEXT,
ADD COLUMN     "shop_name" TEXT,
ADD COLUMN     "price_value" INTEGER,
ADD COLUMN     "image_url" TEXT;

-- AlterTable
ALTER TABLE "shopping_products" ADD COLUMN     "category" TEXT;
