-- Campaign rewards switch from an order-count milestone ("reach N completed
-- orders") to a paid-cashback-amount milestone ("reach N VND already paid
-- out"). Old order_threshold values and tiers_json blobs (both order-count
-- based) have no valid meaning under the new amount-based model, so existing
-- reward rows are cleared and existing tiers reset to empty for admins to
-- redefine - there is no real user-facing history to preserve yet.
DELETE FROM "campaign_rewards";
UPDATE "campaigns" SET "tiers_json" = '[]';

ALTER TABLE "campaign_rewards" DROP CONSTRAINT IF EXISTS "campaign_rewards_campaign_id_user_id_order_threshold_key";

ALTER TABLE "campaign_rewards" RENAME COLUMN "order_threshold" TO "threshold_amount";
ALTER TABLE "campaign_rewards" ALTER COLUMN "threshold_amount" TYPE DOUBLE PRECISION;

CREATE UNIQUE INDEX "campaign_rewards_campaign_id_user_id_threshold_amount_key" ON "campaign_rewards"("campaign_id", "user_id", "threshold_amount");
