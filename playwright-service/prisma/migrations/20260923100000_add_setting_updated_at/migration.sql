-- Track when each setting row last changed so the mobile app can cheaply ask
-- "has the config changed?" (GET /app/config/version) and skip the download
-- when its cached version still matches.
ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Withdrawal minimum used to be hardcoded in server.js and worker/withdrawalWorker.js.
INSERT INTO "settings" ("key", "value")
VALUES ('min_withdraw_amount', '50000')
ON CONFLICT ("key") DO NOTHING;
