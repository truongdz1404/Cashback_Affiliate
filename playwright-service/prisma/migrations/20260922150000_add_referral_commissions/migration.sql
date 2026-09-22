-- Referral programme v2: the referrer earns a percentage of the cashback on
-- every Completed order their invitee places (funded from the operator's
-- share), instead of a one-off fixed bonus. One row per (referral, order).
CREATE TABLE "referral_commissions" (
    "id" SERIAL NOT NULL,
    "referral_id" INTEGER NOT NULL,
    "referrer_user_id" INTEGER NOT NULL,
    "referred_user_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "pct" DOUBLE PRECISION NOT NULL,
    "base_amount" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "payout_status" TEXT NOT NULL DEFAULT 'unpaid',
    "paid_at" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_commissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_commissions_order_id_key" ON "referral_commissions"("order_id");
CREATE INDEX "referral_commissions_referrer_user_id_payout_status_idx" ON "referral_commissions"("referrer_user_id", "payout_status");
CREATE INDEX "referral_commissions_referred_user_id_idx" ON "referral_commissions"("referred_user_id");

ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referrer_user_id_fkey" FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The fixed first-order bonus is now an optional extra on top of the
-- percentage; an untouched default of 10.000đ becomes "off" so existing
-- deployments do not keep paying both without the admin choosing to.
UPDATE "settings" SET "value" = '0' WHERE "key" = 'referral_reward_amount' AND "value" = '10000';
