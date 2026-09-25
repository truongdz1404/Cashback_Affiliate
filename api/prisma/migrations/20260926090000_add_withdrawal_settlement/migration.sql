-- Settling a withdrawal used to be two separate acts: the admin marked the
-- request 'paid' (which released the reserve the balance was subtracting) and
-- then, by hand, marked each order/referral/reward behind it paid. Anything
-- missed in the second act was immediately withdrawable again. These two
-- tables let the payout settle its own rows in one transaction.

-- Which entitlement rows a withdrawal actually consumed.
CREATE TABLE "withdrawal_items" (
    "id" SERIAL NOT NULL,
    "withdrawal_id" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_items_pkey" PRIMARY KEY ("id")
);

-- The guard that does not depend on the application being correct: one
-- entitlement row can be settled by exactly one withdrawal, ever.
CREATE UNIQUE INDEX "withdrawal_items_source_type_source_id_key"
    ON "withdrawal_items"("source_type", "source_id");

CREATE INDEX "withdrawal_items_withdrawal_id_idx" ON "withdrawal_items"("withdrawal_id");

ALTER TABLE "withdrawal_items" ADD CONSTRAINT "withdrawal_items_withdrawal_id_fkey"
    FOREIGN KEY ("withdrawal_id") REFERENCES "withdrawal_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rows are consumed whole, so a request rarely lands on an exact sum. The
-- difference either way is recorded here rather than silently pocketed by
-- whichever side it happened to favour.
CREATE TABLE "wallet_adjustments" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "withdrawal_id" INTEGER,
    "payout_status" TEXT NOT NULL DEFAULT 'unpaid',
    "paid_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wallet_adjustments_user_id_payout_status_idx"
    ON "wallet_adjustments"("user_id", "payout_status");

ALTER TABLE "wallet_adjustments" ADD CONSTRAINT "wallet_adjustments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
