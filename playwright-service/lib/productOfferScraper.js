const browserManager = require('./browserManager');
const shoppingProductsRepo = require('./repositories/shoppingProducts');
const { parseCsvObjects } = require('./csv');
const { mapCsvRowToProduct } = require('./shoppingProductMapper');
const { PRODUCT_OFFER_URL } = require('./constants');

// How many "select all on this page -> Lấy link hàng loạt" pages to walk per
// run. Kept conservative by default - see the "human-like pacing" comment
// below for why. Override with PRODUCT_OFFER_MAX_PAGES if you've confirmed
// the account tolerates more.
const MAX_PAGES = parseInt(process.env.PRODUCT_OFFER_MAX_PAGES || '3', 10);
// Delay between pages, on top of whatever the click/response round trip
// itself takes.
const PAGE_DELAY_MS = parseInt(process.env.PRODUCT_OFFER_PAGE_DELAY_MS || '4000', 10);

/**
 * Selects every product on the current page, opens the "Link Hoa hồng Sản
 * phẩm" bulk modal, submits it with Sub_id fields left blank (this is a
 * scheduled sync, not a per-user tracked link), and waits for the response
 * that carries the generated CSV's download URL - matched by JSON shape
 * (`{ code: 0, data: { result: "...csv" } }`) rather than by URL, since the
 * exact endpoint path wasn't confirmed ahead of time.
 *
 * NOTE: if Shopee changes this page's markup this is the first thing to
 * re-check - run `npx playwright codegen https://affiliate.shopee.vn/offer/product_offer`
 * (logged in, in your own browser) to inspect the live DOM.
 */
/**
 * Best-effort product image capture. Shopee's own CSV export (what
 * scrapeCurrentPage below uses for name/price/commission) has no image
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

async function scrapeCurrentPage(page) {
  await browserManager.dismissBlockingModals(page);
  const imageMap = await scrapeImageMap(page);

  // Selection is NOT scoped to the current page - checking this box adds
  // this page's rows on top of whatever was already selected on prior pages
  // (confirmed live: page 1 -> "20 selected", page 2 -> "40 selected" without
  // ever unchecking page 1). Left unchecked afterward, later pages' exports
  // would balloon into a growing superset of every page visited so far
  // instead of just that page's own products, and could eventually hit the
  // bulk-selection cap. Toggling the same checkbox off (see bottom of this
  // function) after export resets it back to 0 before the next page.
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

  const csvResponse = await page.context().request.get(csvUrl);
  if (!csvResponse.ok()) {
    throw new Error(`product-offer CSV download failed with status ${csvResponse.status()}`);
  }
  const csvText = (await csvResponse.body()).toString('utf8');

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
  // Not Ant Design - product_offer's pager is a custom
  // `.page-item.page-next` span, disabled via a literal "disabled" class
  // token (confirmed against the live DOM) rather than aria-disabled.
  const nextButton = page.locator('.page-next');
  if ((await nextButton.count()) === 0) return false;
  const classes = (await nextButton.getAttribute('class')) || '';
  if (classes.includes('disabled')) return false;
  await nextButton.click();
  await page.waitForTimeout(1000);
  return true;
}

/**
 * Drives the real product_offer page like a user would (same reasoning as
 * customLink.js's getCustomLinksViaBrowser: Shopee's own page JS should
 * attach whatever anti-fraud tokens it normally attaches). Walks up to
 * `maxPages` pages, waiting PAGE_DELAY_MS between them - customLink.js
 * documents a raw-fetch approach that skipped these tokens as a suspected
 * contributor to commission-fraud rejections on this account; hammering
 * every page back-to-back with no delay would risk the same thing.
 */
async function runProductOfferSync({ maxPages = MAX_PAGES } = {}) {
  const context = await browserManager.getContext();
  const page = await context.newPage();
  const collected = [];
  let pagesVisited = 0;

  try {
    await page.goto(PRODUCT_OFFER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (/passport|login/i.test(page.url())) {
      throw new Error('Not logged in - call POST /login with valid cookies first.');
    }

    for (let i = 0; i < maxPages; i++) {
      collected.push(...(await scrapeCurrentPage(page)));
      pagesVisited++;

      if (i < maxPages - 1) {
        const moved = await goToNextPage(page);
        if (!moved) break;
        await page.waitForTimeout(PAGE_DELAY_MS);
      }
    }
  } finally {
    await page.close().catch(() => {});
  }

  const saved = await shoppingProductsRepo.upsertMany(collected);
  return { pagesVisited, scraped: collected.length, saved };
}

module.exports = { runProductOfferSync };
