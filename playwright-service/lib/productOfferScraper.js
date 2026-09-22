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

const DEFAULT_TAB_NAME = 'Tất cả';

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
        throw new Error(`product-offer CSV download failed with status ${csvResponse.status()}`);
      }
      return (await csvResponse.body()).toString('utf8');
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await page.waitForTimeout(2000);
    }
  }
  throw lastErr;
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

// Category tabs above the product grid (confirmed against a live DOM dump:
// `rc-tabs-tab-btn` elements, e.g. "Tất cả", "Bán chạy nhất", "Hoa hồng
// Xtra", plus one tab per Shopee category). Matched by visible label text
// rather than the underlying tab id, since those ids are Shopee category ids
// that aren't guaranteed stable across accounts/time, while the label is
// what an admin actually sees and picks from. Always clicks exactly once
// (even for the default "Tất cả") so the run doesn't depend on whatever tab
// Shopee's own UI happened to leave selected from a previous session.
async function selectTab(page, tabName) {
  // Matched by class + substring text rather than role/accessible-name: a
  // first attempt using getByRole('tab', { name, exact: true }) failed on a
  // real production run even after waiting for the tab bar to render, most
  // likely because the tab's computed accessible name carries extra content
  // (e.g. a count badge) that breaks an exact match. `.rc-tabs-tab` + hasText
  // only needs the label as a substring, which tolerates that.
  const tab = page.locator('.rc-tabs-tab', { hasText: tabName }).first();
  try {
    // The tab bar is rendered client-side after the initial page load, so it
    // isn't there yet right after page.goto() - wait for it instead of just
    // checking count() immediately.
    await tab.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    // Surface what tabs (if any) actually rendered - without this, a
    // selector mismatch just says "not found" with no way to tell whether
    // the tab bar rendered at all or rendered with different labels.
    const seen = await page
      .locator('.rc-tabs-tab')
      .allTextContents()
      .catch(() => []);
    throw new Error(
      `product-offer tab "${tabName}" not found on the page (tabs seen: ${seen.length ? seen.join(', ') : 'none'})`
    );
  }
  await tab.click();
  await page.waitForTimeout(1500);
  await browserManager.dismissBlockingModals(page);
}

// Free-text search box above the grid (`input[placeholder="Tìm kiếm tất cả
// sản phẩm Shopee"]` + a "Tìm kiếm" submit button next to it - not a real
// <button>, just a clickable div, confirmed against a live DOM dump).
async function performSearch(page, searchText, sortLabel) {
  const searchInput = page.getByPlaceholder('Tìm kiếm tất cả sản phẩm Shopee');
  await searchInput.waitFor({ state: 'visible', timeout: 15000 });
  await searchInput.fill(searchText);
  await page.locator('.ant-input-group-addon', { hasText: 'Tìm kiếm' }).first().click();
  await page.waitForTimeout(1500);
  await browserManager.dismissBlockingModals(page);

  // The "Sắp xếp theo" (sort) filter only appears once a search has been
  // run - matched by the sort option's own visible label text ("Liên quan",
  // "Hoa hồng (%)", "Bán chạy", "Giá: Thấp đến Cao"), same reasoning as
  // selectTab above. Left alone (Shopee's own default, "Liên quan") if no
  // sortLabel is given.
  if (sortLabel) {
    const sortOption = page.locator('label.ant-radio-button-wrapper', { hasText: sortLabel }).first();
    try {
      await sortOption.waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      throw new Error(`product-offer sort option "${sortLabel}" not found on the page`);
    }
    await sortOption.click();
    await page.waitForTimeout(1500);
  }
}

// Walks the pager forward to `startPage` before any scraping begins, at the
// same pace as goToNextPage between real scraped pages (see
// runProductOfferSync's own comment on why: hammering the pager with no
// delay risks the same anti-fraud rejections customLink.js documents
// elsewhere). Returns how many pages it actually reached, which can be less
// than requested if the pager runs out first (e.g. a narrow search).
async function skipToStartPage(page, startPage) {
  let reached = 1;
  while (reached < startPage) {
    const moved = await goToNextPage(page);
    if (!moved) break;
    reached++;
    await page.waitForTimeout(PAGE_DELAY_MS);
  }
  return reached;
}

/**
 * Drives the real product_offer page like a user would (same reasoning as
 * customLink.js's getCustomLinksViaBrowser: Shopee's own page JS should
 * attach whatever anti-fraud tokens it normally attaches). Walks up to
 * `maxPages` pages, waiting PAGE_DELAY_MS between them - customLink.js
 * documents a raw-fetch approach that skipped these tokens as a suspected
 * contributor to commission-fraud rejections on this account; hammering
 * every page back-to-back with no delay would risk the same thing.
 *
 * Each page's products are saved to the DB as soon as that page is scraped,
 * rather than batching everything to the end - a transient failure on a
 * later page (the CSV download has been seen to fail outright with a
 * connection-level "socket hang up") then only costs that page's data
 * instead of discarding every page already gathered in this run. Such a
 * failure stops the run early but still returns normally (`stoppedEarly`
 * describes why) rather than throwing, since a partial result that's
 * already safely saved isn't a failure worth alarming an admin over.
 */
async function runProductOfferSync({
  maxPages = MAX_PAGES,
  tabName,
  startPage = 1,
  searchText,
  sortLabel,
} = {}) {
  const context = await browserManager.getContext();
  const page = await context.newPage();
  let pagesVisited = 0;
  let totalScraped = 0;
  let totalSaved = 0;
  let stoppedEarly = null;

  try {
    await page.goto(PRODUCT_OFFER_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (/passport|login/i.test(page.url())) {
      throw new Error('Not logged in - call POST /login with valid cookies first.');
    }

    await selectTab(page, (tabName && tabName.trim()) || DEFAULT_TAB_NAME);
    if (searchText && searchText.trim()) {
      await performSearch(page, searchText.trim(), sortLabel);
    }
    if (startPage > 1) {
      const reached = await skipToStartPage(page, startPage);
      if (reached < startPage) {
        stoppedEarly = `only ${reached} page(s) available, could not reach start page ${startPage}`;
      }
    }

    for (let i = 0; i < maxPages && !stoppedEarly; i++) {
      let pageProducts;
      try {
        pageProducts = await scrapeCurrentPage(page);
      } catch (err) {
        stoppedEarly = err.message;
        break;
      }

      totalScraped += pageProducts.length;
      totalSaved += await shoppingProductsRepo.upsertMany(pageProducts);
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

  return { pagesVisited, scraped: totalScraped, saved: totalSaved, stoppedEarly };
}

module.exports = { runProductOfferSync };
