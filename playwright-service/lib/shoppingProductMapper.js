// Shared between productOfferScraper.js (the automated "Lấy link hàng loạt"
// CSV export) and shoppingProductImport.js (an admin manually uploading the
// product list file Shopee's own dashboard exports) - same Shopee column
// names, same raw-vs-user-facing commission caveat either way.

// Shopee's export uses Vietnamese shorthand with a comma decimal separator:
// "108,0k" -> 108000, "2,8tr" -> 2800000. Returns null for anything that
// doesn't match (kept as priceText regardless, for display).
function parsePriceToVnd(priceText) {
  if (!priceText) return null;
  const match = priceText.trim().match(/^([\d.]+(?:,\d+)?)\s*(k|tr)?$/i);
  if (!match) return null;
  const numeric = Number(match[1].replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(numeric)) return null;
  const unit = (match[2] || '').toLowerCase();
  const multiplier = unit === 'tr' ? 1_000_000 : unit === 'k' ? 1_000 : 1;
  return Math.round(numeric * multiplier);
}

// "2,5%" -> 2.5. This is Shopee's RAW affiliate-account rate, not what an
// app user receives - see the schema.prisma comment on commissionRateValue.
function parseCommissionRatePct(rateText) {
  if (!rateText) return null;
  const match = rateText.trim().match(/^([\d.]+(?:,\d+)?)\s*%$/);
  if (!match) return null;
  const numeric = Number(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(numeric) ? null : numeric;
}

// "₫2.160" -> 2160. Same raw-value caveat as parseCommissionRatePct.
function parseCommissionAmountVnd(commissionText) {
  if (!commissionText) return null;
  const cleaned = commissionText.replace(/[₫\s]/g, '').replace(/\./g, '');
  const numeric = Number(cleaned);
  return Number.isNaN(numeric) ? null : numeric;
}

function mapCsvRowToProduct(row) {
  const priceText = (row['Giá'] || '').trim() || null;
  const commissionRateText = (row['Tỉ lệ hoa hồng'] || '').trim() || null;
  const commissionText = (row['Hoa hồng'] || '').trim() || null;
  return {
    productId: (row['Mã sản phẩm'] || '').trim(),
    name: (row['Tên sản phẩm'] || '').trim(),
    priceText,
    priceValue: parsePriceToVnd(priceText),
    revenueText: (row['Doanh thu'] || '').trim() || null,
    shopName: (row['Tên cửa hàng'] || '').trim() || null,
    commissionRateText,
    commissionText,
    commissionRateValue: parseCommissionRatePct(commissionRateText),
    commissionValue: parseCommissionAmountVnd(commissionText),
    productUrl: (row['Link sản phẩm'] || '').trim() || null,
    offerUrl: (row['Link ưu đãi'] || '').trim() || null,
    // Not in Shopee's CSV export - productOfferScraper.js fills this in
    // separately from the page DOM; admin CSV/XLSX imports leave it null.
    imageUrl: null,
  };
}

// Maps commission.js's `meta`/`commissionTable` (an addlivetag lookup snapshot,
// see getCommissionViaApi) into ShoppingProduct fields - shared by
// lib/categoryEnrichment.js's cron backfill and the insert-if-missing hook off
// POST /app/link (lib/repositories/shoppingProducts.js's ensureExists), so
// both write the exact same shape from the exact same source. Fields addlivetag
// didn't have anything for come back `undefined` (not `null`) so callers can
// spread this into a Prisma update/create without clobbering existing data.
function mapMetaToProductFields(meta, commissionTable) {
  const totals = (commissionTable && commissionTable[0]) || null;
  return {
    name: meta?.itemName || undefined,
    shopName: meta?.shopName || undefined,
    // `undefined` when absent like everything else here, and doubly so for this
    // one: shop_id carries a foreign key, so writing an id whose Shop row does
    // not exist yet fails the entire write. Every caller must create the shop
    // first - lib/repositories/shops.js#ensureFromProduct is that step.
    shopId: meta?.shopId || undefined,
    priceValue: meta?.priceValue ?? undefined,
    imageUrl: meta?.imageUrl || undefined,
    category: meta?.catName || undefined,
    isXtraCommission: typeof meta?.isXtraCommission === 'boolean' ? meta.isXtraCommission : undefined,
    commissionRateValue: totals?.totalPct ?? undefined,
    commissionValue: totals?.totalAmount ?? undefined,
  };
}

module.exports = {
  parsePriceToVnd,
  parseCommissionRatePct,
  parseCommissionAmountVnd,
  mapCsvRowToProduct,
  mapMetaToProductFields,
};
