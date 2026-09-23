const browserManager = require('./browserManager');
const shoppingProductsRepo = require('./repositories/shoppingProducts');
const { PRODUCT_OFFER_URL } = require('./constants');
// The grid itself - select-all, bulk link, CSV, pager - is shared with
// brand_offer (the per-shop page), so it lives in one module both drive.
const { PAGE_DELAY_MS, scrapeCurrentGridPage, goToNextPage } = require('./offerGridScraper');

// How many "select all on this page -> Lấy link hàng loạt" pages to walk per
// run. Kept conservative by default - see the "human-like pacing" comment
// below for why. Override with PRODUCT_OFFER_MAX_PAGES if you've confirmed
// the account tolerates more.
const MAX_PAGES = parseInt(process.env.PRODUCT_OFFER_MAX_PAGES || '3', 10);

const DEFAULT_TAB_NAME = 'Tất cả';

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

  // Two attempts: a run kicked off right after a prior multi-page crawl just
  // finished (confirmed live: 25-page crawl finished, and a new run starting
  // ~15s later found the tab bar entirely absent) can hit the page before it
  // has actually finished loading, even past the visibility timeout - a
  // reload gives it a clean second chance instead of failing the whole run
  // over what's most likely just slow load timing.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // The tab bar is rendered client-side after the initial page load, so it
      // isn't there yet right after page.goto() - wait for it instead of just
      // checking count() immediately.
      await tab.waitFor({ state: 'visible', timeout: 15000 });
      await tab.click();
      await page.waitForTimeout(1500);
      await browserManager.dismissBlockingModals(page);
      return;
    } catch {
      if (attempt === 2) {
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
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
  }
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

    const selectedTabName = (tabName && tabName.trim()) || DEFAULT_TAB_NAME;
    await selectTab(page, selectedTabName);
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
        pageProducts = await scrapeCurrentGridPage(page);
      } catch (err) {
        stoppedEarly = err.message;
        break;
      }

      totalScraped += pageProducts.length;
      // `category` itself is left untouched here (no key in the spread below)
      // so a re-scrape never clobbers a real taxonomy value already written by
      // lib/categoryEnrichment.js's backfill or the /app/link insert-if-missing
      // hook - both source category from addlivetag's catName exclusively, the
      // same place Link.catName comes from (see prisma/migrations/
      // 20260922120000_split_shopping_product_category). selectTab still tells
      // us which tab this page came from for free, so keep that as a raw audit
      // trail plus the two pseudo-tag flags worth querying on directly.
      totalSaved += await shoppingProductsRepo.upsertMany(
        pageProducts.map((p) => ({
          ...p,
          sourceTab: selectedTabName,
          isBestSeller: /bán chạy/i.test(selectedTabName),
          isXtraCommission: /xtra/i.test(selectedTabName),
        }))
      );
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
