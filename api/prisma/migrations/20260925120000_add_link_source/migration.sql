-- Which surface a link was created from: the "Tạo link" paste screen, a
-- product card (by screen), a shop storefront tap, or the Zalo bot. The same
-- value is minted into subId2 of the Shopee link, so this column and the
-- conversion report use one vocabulary - see api/lib/linkSources.js.
--
-- Nullable rather than defaulted: every existing row predates the column and
-- genuinely has no known source, and writing a made-up one would quietly
-- poison the first report anyone runs.
ALTER TABLE "links" ADD COLUMN "source" TEXT;
