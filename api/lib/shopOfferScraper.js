const browserManager = require('./browserManager');
const shoppingProductsRepo = require('./repositories/shoppingProducts');
const { BRAND_OFFER_URL } = require('./constants');
const { PAGE_DELAY_MS, scrapeCurrentGridPage, goToNextPage } = require('./offerGridScraper');

// How many grid pages to walk per shop. A brand_offer page holds 20 products
// (measured, not assumed - scripts/probe-brand-offer.js counted 20 cards and
// 20 CSV rows), and the bulk-link selection caps at 100, i.e. exactly five
// pages' worth. Five is therefore the largest number that still needs only one
// pass of the selection counter, and it is what was chosen for the default.
const MAX_PAGES = parseInt(process.env.SHOP_CRAWL_MAX_PAGES || '5', 10);

// How long to wait for the first product card. Longer than the tab-bar waits in
// productOfferScraper.js because nothing has been clicked yet: this is the
// cold render right after navigation.
const GRID_TIMEOUT_MS = parseInt(process.env.SHOP_CRAWL_GRID_TIMEOUT_MS || '20000', 10);

/**
 * Crawls one shop's offer grid and saves its products already linked to that
 * shop.
 *
 * This is the cheap, certain half of the shop ecosystem: the URL is keyed by
 * shop_id, so every row it produces belongs to that shop by construction. No
 * name matching, no ambiguity, nothing for lib/shopResolution.js to get wrong.
 * Resolution's job is only to find shops worth crawling in the first place.
 *
 * Returns rather than throws when a shop simply has no offers - a merchant with
 * nothing in the affiliate programme is an ordinary, expected state, and making
 * it look like a failure would fill the dashboard with alarms nobody should act
 * on. Real breakage (logged out, a mid-run CSV failure) is still reported:
 * being logged out throws, since it invalidates every other shop in the sweep
 * too, while a page that fails partway through stops the run for THIS shop and
 * says why in `stoppedEarly`, keeping whatever earlier pages already saved.
 */
async function runShopProductSync({ shopId, maxPages = MAX_PAGES } = {}) {
  if (!shopId) throw new Error('runShopProductSync requires a shopId');
  const id = String(shopId);

  const context = await browserManager.getContext();
  const page = await context.newPage();
  let pagesVisited = 0;
  let totalScraped = 0;
  let totalSaved = 0;
  let stoppedEarly = null;
  let empty = false;

  try {
    await page.goto(BRAND_OFFER_URL(id), { waitUntil: 'domcontentloaded', timeout: 30000 });

    // The grid renders client-side, so it is not there yet when goto resolves.
    // A timeout here is the "no offers" case far more often than it is a broken
    // page, so it is handled as data rather than as an error - but only after
    // checking we are still on the shop's own page, which is what tells the two
    // apart.
    try {
      await page.locator('.ItemCard__container').first().waitFor({ state: 'visible', timeout: GRID_TIMEOUT_MS });
    } catch {
      await browserManager.dismissBlockingModals(page);
      const cards = await page.locator('.ItemCard__container').count();
      if (cards === 0) {
        // Asked here rather than before the wait: this runs once per shop in a
        // sweep of hundreds, and a healthy shop should not pay for a check its
        // rendered grid already answers. The login bounce has had the whole
        // grid timeout to happen by now, so the wait returns at once.
        // It has to come before the URL test below, because the login page
        // carries the shop's own URL in its `next` parameter - so a logged-out
        // sweep passed that test and recorded every shop as simply empty.
        await browserManager.assertLoggedIn(page, 5000);
        if (!page.url().includes(id)) {
          throw new Error(`brand_offer for shop ${id} redirected to ${page.url()}`);
        }
        return { shopId: id, pagesVisited: 0, scraped: 0, saved: 0, empty: true, stoppedEarly: null };
      }
    }

    for (let i = 0; i < maxPages; i++) {
      let pageProducts;
      try {
        pageProducts = await scrapeCurrentGridPage(page);
      } catch (err) {
        stoppedEarly = err.message;
        break;
      }

      totalScraped += pageProducts.length;
      // `shopId` is the whole point of this crawler and is set unconditionally.
      // The two pseudo-tag flags and `sourceTab` are NOT: they describe the
      // product_offer tab a product was found under, which this page cannot
      // know. Passing them here would overwrite `is_best_seller` on every
      // product the daily scrape had already tagged. `sourceTab` goes through
      // createOnly so a product first seen here still records where it came
      // from, without touching one the daily scrape already labelled.
      totalSaved += await shoppingProductsRepo.upsertMany(
        pageProducts.map((p) => ({ ...p, shopId: id })),
        { createOnly: { sourceTab: `shop:${id}` } }
      );
      pagesVisited++;

      if (i < maxPages - 1) {
        const moved = await goToNextPage(page);
        if (!moved) break;
        await page.waitForTimeout(PAGE_DELAY_MS);
      }
    }

    if (pagesVisited > 0 && totalScraped === 0) empty = true;
  } finally {
    await page.close().catch(() => {});
  }

  return { shopId: id, pagesVisited, scraped: totalScraped, saved: totalSaved, empty, stoppedEarly };
}

module.exports = { runShopProductSync, MAX_PAGES };
