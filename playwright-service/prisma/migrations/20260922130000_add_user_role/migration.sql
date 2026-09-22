-- One account model for members and administrators: the dashboard is
-- unlocked by this flag on the same row a normal sign-in produces, instead of
-- a separate password-only admin session.
ALTER TABLE "users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

CREATE INDEX "users_role_idx" ON "users"("role");
