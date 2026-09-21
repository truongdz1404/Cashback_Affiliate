const XLSX = require('xlsx');
const { parseCsvObjects } = require('./csv');
const { mapCsvRowToProduct } = require('./shoppingProductMapper');
const shoppingProductsRepo = require('./repositories/shoppingProducts');

// Shopee's affiliate dashboard offers the same product list as either a
// plain .csv (what the automated scraper already consumes, see
// productOfferScraper.js) or a manually-downloaded .xlsx "Excel" file with
// the same columns - accept both so an admin can drag in whichever one they
// actually have.
function parseRows(buffer, fileName) {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }).map((row) => {
      const normalized = {};
      for (const key of Object.keys(row)) {
        normalized[key] = row[key] == null ? '' : String(row[key]);
      }
      return normalized;
    });
  }
  return parseCsvObjects(buffer.toString('utf8'));
}

async function importFile(buffer, fileName) {
  if (!buffer || buffer.length === 0) throw new Error('File rỗng hoặc không hợp lệ');

  const rows = parseRows(buffer, fileName);
  const products = rows.map(mapCsvRowToProduct).filter((p) => p.productId);
  if (products.length === 0) {
    throw new Error('Không tìm thấy sản phẩm hợp lệ trong file - kiểm tra lại đúng file Shopee xuất ra (cần có cột "Mã sản phẩm").');
  }

  const saved = await shoppingProductsRepo.upsertMany(products);
  return { rows: rows.length, parsed: products.length, saved };
}

module.exports = { importFile };
