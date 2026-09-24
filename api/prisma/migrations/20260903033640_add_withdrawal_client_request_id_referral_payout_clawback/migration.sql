-- AlterTable
ALTER TABLE "referrals" ADD COLUMN     "payout_status" TEXT NOT NULL DEFAULT 'unpaid',
ADD COLUMN     "paid_at" TEXT,
ADD COLUMN     "qualifying_order_id" INTEGER;

-- AlterTable
ALTER TABLE "withdrawal_requests" ADD COLUMN     "client_request_id" TEXT;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "product_name" TEXT;

-- CreateTable
CREATE TABLE "clawback_flags" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" INTEGER NOT NULL,
    "previous_payout_status" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by" TEXT,
    "note" TEXT,

    CONSTRAINT "clawback_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "withdrawal_requests_client_request_id_key" ON "withdrawal_requests"("client_request_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_user_id_payout_status_idx" ON "referrals"("referrer_user_id", "payout_status");

-- AddForeignKey
ALTER TABLE "clawback_flags" ADD CONSTRAINT "clawback_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
