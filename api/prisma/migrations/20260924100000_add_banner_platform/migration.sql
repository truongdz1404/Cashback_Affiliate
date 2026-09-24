-- Banners split into two independent lists, one per surface. 'app' is the
-- default so every existing row keeps doing what it was created to do, and so
-- an app build that asks GET /app/banners without naming a surface still gets
-- the same list it got before.
ALTER TABLE "banners" ADD COLUMN "platform" TEXT NOT NULL DEFAULT 'app';

CREATE INDEX "banners_platform_is_active_sort_order_idx"
  ON "banners"("platform", "is_active", "sort_order");

-- The website's member home page used to fall back to four hard-coded images
-- that were never added to admin-web/public, so signed-in members saw four
-- broken images. These six are the real artwork, they live in
-- admin-web/public, and seeding them here means the carousel is correct the
-- moment this deploys instead of waiting for someone to add rows by hand.
-- Paths are relative on purpose: the website serves them from its own origin.
-- Guarded so a re-run on a database that already has web banners does nothing.
INSERT INTO "banners" ("image_url", "link_url", "sort_order", "is_active", "platform")
SELECT seed.image_url, seed.link_url, seed.sort_order, seed.is_active, seed.platform
FROM (VALUES
  ('/banner1.png'::text, '/link'::text,                          0, TRUE, 'web'::text),
  ('/banner5.png',       '/products',                            1, TRUE, 'web'),
  ('/banner3.png',       '/products?sort=commission_desc',       2, TRUE, 'web'),
  ('/banner2.png',       '/account/wallet',                      3, TRUE, 'web'),
  ('/banner4.png',       '/account/referral',                    4, TRUE, 'web'),
  ('/banner6.png',       'https://play.google.com/store/apps/details?id=com.dreek.rewally', 5, TRUE, 'web')
) AS seed(image_url, link_url, sort_order, is_active, platform)
WHERE NOT EXISTS (SELECT 1 FROM "banners" WHERE "platform" = 'web');
