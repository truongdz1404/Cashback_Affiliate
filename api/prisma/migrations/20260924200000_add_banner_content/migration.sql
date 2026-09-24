-- A web banner stopped being just a picture. The artwork is drawn with an empty
-- left column and the eyebrow, headline, body copy and buttons are rendered as
-- HTML on top of it, so each of those pieces now lives in its own column and
-- can be edited from the admin dashboard without redrawing the image.
--
-- Every column is nullable. An app banner fills none of them and keeps being a
-- plain picture; a web banner that fills none of them renders the same way.
ALTER TABLE "banners"
  ADD COLUMN "bg_color"               TEXT,
  ADD COLUMN "eyebrow"                TEXT,
  ADD COLUMN "title"                  TEXT,
  ADD COLUMN "body"                   TEXT,
  ADD COLUMN "image_alt"              TEXT,
  ADD COLUMN "text_align"             TEXT,
  ADD COLUMN "primary_label"          TEXT,
  ADD COLUMN "primary_url"            TEXT,
  ADD COLUMN "secondary_label"        TEXT,
  ADD COLUMN "secondary_url"          TEXT,
  ADD COLUMN "member_primary_label"   TEXT,
  ADD COLUMN "member_primary_url"     TEXT,
  ADD COLUMN "member_secondary_label" TEXT,
  ADD COLUMN "member_secondary_url"   TEXT;

-- The six slides the website was rendering from a hard-coded array move into
-- the database so the operator owns them. They replace the earlier web seed
-- (/banner1.png .. /banner6.png), which was a set of flat images with the copy
-- baked in - but only where those rows are still untouched, so a banner the
-- operator has since edited or added is never thrown away.
DELETE FROM "banners"
WHERE "platform" = 'web'
  AND "image_url" IN ('/banner1.png', '/banner2.png', '/banner3.png', '/banner4.png', '/banner5.png', '/banner6.png')
  AND "eyebrow" IS NULL
  AND "title" IS NULL;

INSERT INTO "banners" (
  "image_url", "image_alt", "bg_color", "link_url", "sort_order", "is_active", "platform",
  "eyebrow", "title", "body", "text_align",
  "primary_label", "primary_url", "secondary_label", "secondary_url",
  "member_primary_label", "member_primary_url", "member_secondary_label", "member_secondary_url"
)
SELECT
  seed.image_url, seed.image_alt, seed.bg_color, seed.link_url, seed.sort_order, seed.is_active, seed.platform,
  seed.eyebrow, seed.title, seed.body, seed.text_align,
  seed.primary_label, seed.primary_url, seed.secondary_label, seed.secondary_url,
  seed.member_primary_label, seed.member_primary_url, seed.member_secondary_label, seed.member_secondary_url
FROM (VALUES
  (
    '/rewally-banner/01-hoan-tien-moi-don.png'::text,
    'Ứng dụng Rewally hiển thị số dư hoàn tiền và một sản phẩm đang hoàn 8%'::text,
    '#F7FEFB'::text,
    NULL::text,
    0, TRUE, 'web'::text,
    'Miễn phí tham gia'::text,
    'Cứ mua sắm là được hoàn tiền'::text,
    'Mua hàng Shopee như bình thường, chỉ cần đi qua Rewally. Hoàn tiền được ghi nhận theo từng đơn và rút về ngân hàng khi đủ điều kiện.'::text,
    'center'::text,
    'Tham gia nhận hoàn tiền'::text, '/register'::text,
    'Xem sản phẩm'::text,            '/products'::text,
    'Săn deal hoàn tiền'::text,      '/products'::text,
    'Ví hoàn tiền của tôi'::text,    '/account/wallet'::text
  ),
  (
    '/rewally-banner/02-deal-hoan-tien-cao.png',
    'Hai thẻ sản phẩm với tỷ lệ hoàn tiền nổi bật và nút hoàn tiền',
    '#FBFEFD',
    NULL,
    1, TRUE, 'web',
    'Deal hoàn tiền cao',
    'Săn sản phẩm có tỷ lệ hoàn cao nhất',
    'Danh sách hoàn tiền cao được cập nhật liên tục và xếp sẵn theo từng danh mục bạn hay mua.',
    'center',
    'Săn deal hoàn cao',      '/products',
    'Chiến dịch đang chạy',   '/campaigns',
    NULL, NULL,
    NULL, NULL
  ),
  (
    '/rewally-banner/03-vi-hoan-tien.png',
    'Thẻ ví hoàn tiền Rewally với nút rút tiền, tiền mặt và đồng xu',
    '#FDFEFD',
    NULL,
    2, TRUE, 'web',
    'Ví hoàn tiền',
    'Tiền về ví, rút thẳng về ngân hàng',
    'Theo dõi từng đơn, biết rõ khi nào khoản hoàn được duyệt và rút về tài khoản của bạn.',
    'center',
    'Tạo tài khoản',     '/register',
    'Cách hoạt động',    '/guide',
    'Mở ví hoàn tiền',   '/account/wallet',
    NULL, NULL
  ),
  (
    '/rewally-banner/04-tao-link-nhanh.png',
    'Ô dán link sản phẩm Shopee và nút tạo link của Rewally',
    '#FEFEFE',
    NULL,
    3, TRUE, 'web',
    'Tạo link trong vài giây',
    'Dán link sản phẩm, nhận hoàn tiền',
    'Copy link từ Shopee rồi dán vào Rewally và mua như bình thường. Không cần cài thêm tiện ích nào.',
    'center',
    'Dán link ngay',   '/link',
    'Hướng dẫn',       '/guide',
    NULL, NULL,
    NULL, NULL
  ),
  (
    '/rewally-banner/05-gioi-thieu-ban-be.png',
    'Hai người dùng được kết nối với nhau, hộp quà và ô mã giới thiệu',
    '#FBFEFD',
    NULL,
    4, TRUE, 'web',
    'Giới thiệu bạn bè',
    'Rủ bạn cùng mua, cùng nhận thưởng',
    'Mỗi người bạn giới thiệu thành công đều mang thêm hoàn tiền về cho bạn.',
    'center',
    'Nhận mã giới thiệu',  '/register',
    'Tìm hiểu thêm',       '/guide',
    'Lấy mã giới thiệu',   '/account/referral',
    NULL, NULL
  ),
  (
    '/rewally-banner/06-tai-app-qr-chuan.png',
    'Ứng dụng Rewally trên điện thoại kèm mã QR để tải app',
    '#FDEAE7',
    NULL,
    5, TRUE, 'web',
    'Ứng dụng Rewally',
    'Săn deal, nhận hoàn tiền ngay trên điện thoại',
    'Theo dõi đơn, rút tiền và nhận thông báo deal mới mọi lúc.',
    'top',
    'Tải ứng dụng', 'https://play.google.com/store/apps/details?id=com.dreek.rewally',
    NULL, NULL,
    NULL, NULL,
    NULL, NULL
  )
) AS seed(
  image_url, image_alt, bg_color, link_url, sort_order, is_active, platform,
  eyebrow, title, body, text_align,
  primary_label, primary_url, secondary_label, secondary_url,
  member_primary_label, member_primary_url, member_secondary_label, member_secondary_url
)
-- Only when the web list is empty, so re-running a restored database or an
-- operator who already curated their own slides never gets six duplicates.
WHERE NOT EXISTS (SELECT 1 FROM "banners" WHERE "platform" = 'web');
