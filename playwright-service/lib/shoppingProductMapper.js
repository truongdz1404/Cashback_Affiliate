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
  };
}

module.exports = { parsePriceToVnd, parseCommissionRatePct, parseCommissionAmountVnd, mapCsvRowToProduct };
