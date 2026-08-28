-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT,
ADD COLUMN     "facebook_id" TEXT,
ADD COLUMN     "google_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_facebook_id_key" ON "users"("facebook_id");

