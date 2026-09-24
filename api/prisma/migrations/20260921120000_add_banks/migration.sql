-- New table only, no existing data touched.
CREATE TABLE "banks" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "bin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL,
    "logo_path" TEXT NOT NULL,
    "swift_code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "banks_code_key" ON "banks"("code");
CREATE UNIQUE INDEX "banks_bin_key" ON "banks"("bin");
