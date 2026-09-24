const browserManager = require('./browserManager');
const { parseCsvObjects } = require('./csv');
const { mapCsvRowToProduct } = require('./shoppingProductMapper');

/**
 * The product grid that `offer/product_offer` and `offer/brand_offer/<shop_id>`
 * both render: the same card markup, the same "Chọn tất cả sản phẩm trên trang
 * này" checkbox, the same "Lấy link hàng loạt" button, the same JSON-then-CSV
 * round trip, the same pager, and the same nine Vietnamese CSV column names.
 *
 * Verified rather than assumed: scripts/probe-brand-offer.js drove a real
 * brand_offer page end to end and reported one select-all checkbox, one bulk
 * button, `bulkOutcome: "json-csv-url"`, a header byte-identical to the one
 * mapCsvRowToProduct keys off, 20 of 20 rows mapped with a product id, and the
 * selection counter returning to "0 / 100 Đã chọn" after deselecting.
 *
 * Extracted here verbatim from productOfferScraper.js so both callers drive
 * the grid through one implementation - a fix to the selection-carryover
 * handling below has to land in one place, not two.
 *
 * What stays behind in productOfferScraper.js is what is genuinely specific to
 * that page: the category tab bar and the free-text search box. brand_offer has
 * neither; it is already scoped to one shop.
 */

// Delay between pages, on top of whatever the click/response round trip
// itself takes.
const PAGE_DELAY_MS = parseInt(process.env.PRODUCT_OFFER_PAGE_DELAY_MS || '4000', 10);

/**
 * Best-effort product image capture. Shopee's own CSV export (what
 * scrapeCurrentGridPage below uses for name/price/commission) has no image
 * column, so images have to come from the page's DOM instead. There's no
 * visible product-id attribute to key off of here, so this relies on DOM card
 * order matching the CSV row order for THIS SAME page - both are produced by
 * the same "select all rows on this page -> export" action below, so the row
 * set is identical; only the top-to-bottom order needs to line up, which
 * holds as long as the grid renders in the same order it exports.
 *
 * The page is a card grid (`.ItemCard__container`), not a `<table>` - confirmed
 * against a real logged-in DOM dump. Each card's image lives at
 * `.ItemCard__imageSection .ItemCard__image img`. Re-check with
 * `npx playwright codegen https://affiliate.shopee.vn/offer/product_offer`
 * (logged in) if Shopee changes this markup and images stop showing up again.
 */
async function scrapeImageMap(page) {
  try {
    return await page.locator('.ItemCard__container').evaluateAll((cards) =>
      cards.map((card) => {
        const img = card.querySelector('.ItemCard__image img');
        if (!img) return null;
        return img.getAttribute('src') || img.getAttribute('data-src') || null;
      })
    );
  } catch {
    return [];
  }
}

// The CSV download (a plain GET, not the page's own JS) has been observed to
// fail with a raw connection-level error ("socket hang up") rather than a
// normal HTTP error status - transient, so a couple of retries with a short
// pause clear it up without needing to abandon the whole run.
async function fetchCsvText(page, csvUrl, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const csvResponse = await page.context().request.get(csvUrl);
      if (!csvResponse.ok()) {
        throw new Error(`offer CSV download failed with status ${csvResponse.status()}`);
      }
      return (await csvResponse.body()).toString('utf8');
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await page.waitForTimeout(2000);
    }
  }
  throw lastErr;
}

async function scrapeCurrentGridPage(page) {
  await browserManager.dismissBlockingModals(page);
  const imageMap = await scrapeImageMap(page);

  // Selection is NOT scoped to the current page - checking this box adds
  // this page's rows on top of whatever was already selected on prior pages
  // (confirmed live: page 1 -> "20 selected", page 2 -> "40 selected" without
  // ever unchecking page 1). Left unchecked afterward, later pages' exports
  // would balloon into a growing superset of every page visited so far
  // instead of just that page's own products, and could eventually hit the
  // bulk-selection cap - which the probe read off brand_offer as literally
  // "20 / 100 Đã chọn", i.e. five pages' worth. Toggling the same checkbox
  // off (see bottom of this function) after export resets it back to 0 before
  // the next page.
  const selectAll = page.getByRole('checkbox', { name: /Chọn tất cả sản phẩm trên trang này/i });
  await selectAll.click();

  const bulkButton = page.getByRole('button', { name: /Lấy link hàng loạt/i });
  await bulkButton.click();

  const modalSubmit = page.getByRole('dialog').getByRole('button', { name: /^Lấy link$/i });

  const responsePromise = page.waitForResponse(async (resp) => {
    if (!resp.ok()) return false;
    const contentType = resp.headers()['content-type'] || '';
    if (!contentType.includes('application/json')) return false;
    try {
      const json = await resp.json();
      return json?.code === 0 && typeof json?.data?.result === 'string' && json.data.result.includes('.csv');
    } catch {
      return false;
    }
  }, { timeout: 30000 });

  await modalSubmit.click();
  const response = await responsePromise;
  const json = await response.json();
  const csvUrl = encodeURI(json.data.result);

  const csvText = await fetchCsvText(page, csvUrl);

  await browserManager.dismissBlockingModals(page);

  // Clear the selection this page made (toggling the same checkbox off) so
  // it doesn't carry over and inflate the next page's export.
  await selectAll.click();
  await page.waitForTimeout(300);

  return parseCsvObjects(csvText)
    .map((row, i) => ({ ...mapCsvRowToProduct(row), imageUrl: imageMap[i] || null }))
    .filter((p) => p.productId);
}

async function goToNextPage(page) {
  // Not Ant Design - the pager is a custom `.page-item.page-next` span,
  // disabled via a literal "disabled" class token (confirmed against the live
  // DOM of both pages) rather than aria-disabled.
  const nextButton = page.locator('.page-next');
  if ((await nextButton.count()) === 0) return false;
  const classes = (await nextButton.getAttribute('class')) || '';
  if (classes.includes('disabled')) return false;
  await nextButton.click();
  await page.waitForTimeout(1000);
  return true;
}

module.exports = { PAGE_DELAY_MS, scrapeImageMap, fetchCsvText, scrapeCurrentGridPage, goToNextPage };
