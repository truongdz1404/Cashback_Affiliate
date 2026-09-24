-- Nullable columns only, no existing rows touched. Old links keep NULL
-- estimate (estimate wasn't computed/stored before this migration).
ALTER TABLE "links" ADD COLUMN "estimated_amount" DOUBLE PRECISION;
ALTER TABLE "links" ADD COLUMN "estimated_pct" DOUBLE PRECISION;
