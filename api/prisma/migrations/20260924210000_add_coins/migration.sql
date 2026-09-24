-- Coins: a separate currency from the cashback wallet, earned by daily
-- check-in and paid out alongside a withdrawal at 1 coin = 1 VND.

-- Streak bookkeeping. last_checkin_date is a Vietnam-time calendar day
-- ("2026-09-24"), not a timestamp, so the streak breaks at local midnight.
ALTER TABLE "users" ADD COLUMN "coin_streak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "last_checkin_date" TEXT;

-- The coin half of a payout request. Existing rows are pure cash, which is
-- exactly what 0 means.
ALTER TABLE "withdrawal_requests" ADD COLUMN "coin_amount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "coin_transactions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupe_key" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_transactions_pkey" PRIMARY KEY ("id")
);

-- The idempotency guard. Two simultaneous check-ins for the same day both
-- reach the database and exactly one commits; the loser sees a unique
-- violation and reports "already claimed" instead of double-crediting.
CREATE UNIQUE INDEX "coin_transactions_user_id_kind_dedupe_key_key"
    ON "coin_transactions"("user_id", "kind", "dedupe_key");

CREATE INDEX "coin_transactions_user_id_id_idx" ON "coin_transactions"("user_id", "id");

ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
