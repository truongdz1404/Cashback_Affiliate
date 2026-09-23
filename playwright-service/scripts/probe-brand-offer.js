/**
 * One-shot reconnaissance of https://affiliate.shopee.vn/offer/brand_offer/<shopId>
 * - the per-shop product page we want to crawl the way lib/productOfferScraper.js
 * already crawls offer/product_offer.
 *
 * WHY THIS EXISTS: the whole per-shop crawl design rests on the assumption that
 * brand_offer is "the same page with a different URL" - same `.ItemCard__container`
 * grid, same "Chọn tất cả sản phẩm trên trang này" checkbox, same "Lấy link hàng
 * loạt" button, same `{code:0, data:{result:"<...>.csv"}}` response. Nobody has
 * verified that. Writing the crawler first and finding out afterwards means
 * debugging two unknowns at once against a rate-limited, anti-bot-guarded site.
 *
 * It is deliberately NOT wired into server.js: it drives a real logged-in
 * session, it clicks a real "Lấy link hàng loạt" (which mints real affiliate
 * links on the account), and it must only ever run when a human is watching.
 *
 * USAGE (on the VPS, at a quiet hour, with the service stopped - the box is
 * 2 core/4GB and lib/browserManager.js:8-11 records Chrome being OOM-killed
 * with the tab pool running alongside Postgres):
 *
 *   node scripts/probe-brand-offer.js 1024405393
 *   DISPLAY=:99 HEADLESS=false node scripts/probe-brand-offer.js 1024405393   # to watch it
 *   PROBE_BULK_LINK=0 node scripts/probe-brand-offer.js 1024405393            # read-only pass
 *
 * It reuses storage/storageState.json through browserManager.getContext() and
 * NEVER calls persistStorageState() - a probe must not be able to write a
 * degraded session back over the working one.
 *
 * Output: a human-readable log on stderr, and one JSON report on stdout, so
 * `node scripts/probe-brand-offer.js 123 2>/dev/null > report.json` gives a
 * clean artefact to paste back.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const browserManager = require('../lib/browserManager');
const { parseCsvObjects } = require('../lib/csv');
const { mapCsvRowToProduct } = require('../lib/shoppingProductMapper');

const shopId = (process.argv[2] || '').trim();
if (!shopId || !/^\d+$/.test(shopId)) {
  console.error('Usage: node scripts/probe-brand-offer.js <shopId>   (e.g. 1024405393)');
  process.exit(1);
}

// The bulk-link round trip (step 7) is the only step with a side effect on the
// Shopee account, so it can be skipped for a first look.
const DO_BULK_LINK = process.env.PROBE_BULK_LINK !== '0';
const BRAND_OFFER_URL = `https://affiliate.shopee.vn/offer/brand_offer/${shopId}`;

const log = (...args) => console.error('[probe]', ...args);

const report = {
  shopId,
  url: BRAND_OFFER_URL,
  startedAt: new Date().toISOString(),
  // Everything the page itself asked the network for, captured from BEFORE the
  // navigation. The single most valuable line in this report would be the page
  // calling offer/product/list with code:0 - that endpoint is 403/90309999 when
  // we replay it with cookies alone (docs/shopee-affiliate-api-spec.txt §2),
  // because the anti-bot signature is minted inside the page. If the page can
  // call it, waitForResponse on that XHR beats the whole bulk-CSV dance.
  responses: [],
  downloads: [],
  blocked: [],
  steps: {},
  errors: [],
};

function truncate(value, max = 400) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (!s) return s;
  return s.length > max ? `${s.slice(0, max)}…[+${s.length - max}]` : s;
}

async function step(name, fn) {
  try {
    const value = await fn();
    report.steps[name] = value;
    log(`${name}:`, truncate(value, 300));
    return value;
  } catch (err) {
    report.steps[name] = { error: err.message };
    report.errors.push(`${name}: ${err.message}`);
    log(`${name}: FAILED -`, err.message);
    return null;
  }
}

function attachListeners(page) {
  page.on('response', async (resp) => {
    const url = resp.url();
    if (!/affiliate\.shopee\.vn|shopee\.vn\/api/.test(url)) return;
    const contentType = resp.headers()['content-type'] || '';
    const entry = { url: truncate(url, 220), status: resp.status(), contentType };

    if (contentType.includes('json')) {
      // Body reads can fail for redirects/aborted requests - never let a
      // listener throw, it would surface as an unhandled rejection.
      try {
        const json = await resp.json();
        entry.code = json?.code;
        entry.msg = json?.msg;
        entry.error = json?.error;
        // Note what the payload is shaped like without dumping a 100-product
        // response into the report.
        entry.dataKeys = json?.data && typeof json.data === 'object' ? Object.keys(json.data) : undefined;
        if (json?.error === 90309999 || String(json?.error) === '90309999') {
          report.blocked.push({ ...entry, reason: 'anti-bot 90309999' });
        }
      } catch {
        entry.jsonParse = 'failed';
      }
    }

    if (resp.status() === 403) report.blocked.push({ ...entry, reason: 'HTTP 403' });
    report.responses.push(entry);
  });

  // A real file download would mean brand_offer does NOT behave like
  // product_offer (which never emits one - it returns a JSON body carrying a
  // CSV url that we fetch ourselves).
  page.on('download', async (download) => {
    report.downloads.push({
      suggestedFilename: download.suggestedFilename(),
      url: truncate(download.url(), 220),
    });
    log('DOWNLOAD event:', download.suggestedFilename());
    await download.cancel().catch(() => {});
  });

  page.on('pageerror', (err) => report.errors.push(`pageerror: ${err.message}`));
}

async function probeBulkLink(page, selectAll, bulkButton) {
  // Mirrors lib/productOfferScraper.js:81-106 exactly, so a pass here means the
  // existing scraper body can be pointed at this URL unchanged.
  await selectAll.click();
  await page.waitForTimeout(1000);
  report.steps.selectedCountText = await page
    .locator('text=/đã chọn|selected/i')
    .first()
    .textContent()
    .catch(() => null);

  await bulkButton.click();
  await page.waitForTimeout(1000);

  const modalSubmit = page.getByRole('dialog').getByRole('button', { name: /^Lấy link$/i });
  const hasModal = (await modalSubmit.count()) > 0;
  report.steps.bulkModalSubmitFound = hasModal;
  if (!hasModal) {
    report.steps.dialogText = truncate(
      await page.getByRole('dialog').first().innerText().catch(() => '(no dialog)'),
      600
    );
    return null;
  }

  const responsePromise = page
    .waitForResponse(async (resp) => {
      if (!resp.ok()) return false;
      const contentType = resp.headers()['content-type'] || '';
      if (!contentType.includes('application/json')) return false;
      try {
        const json = await resp.json();
        return json?.code === 0 && typeof json?.data?.result === 'string' && json.data.result.includes('.csv');
      } catch {
        return false;
      }
    }, { timeout: 30000 })
    .catch(() => null);

  // Both outcomes are raced: product_offer resolves the JSON promise and never
  // fires `download`; a page that exports an .xlsx would do the opposite.
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);

  await modalSubmit.click();
  const [response, download] = await Promise.all([responsePromise, downloadPromise]);

  report.steps.bulkOutcome = response ? 'json-csv-url' : download ? 'download-event' : 'nothing-in-30s';
  if (download) {
    report.steps.downloadFilename = download.suggestedFilename();
    await download.cancel().catch(() => {});
  }
  if (!response) return null;

  const json = await response.json();
  const csvUrl = encodeURI(json.data.result);
  report.steps.csvUrl = truncate(csvUrl, 220);

  const csvResponse = await page.context().request.get(csvUrl);
  report.steps.csvStatus = csvResponse.status();
  if (!csvResponse.ok()) return null;

  const csvText = (await csvResponse.body()).toString('utf8');
  const lines = csvText.split(/\r?\n/);

  // THE most important two lines in this whole report. mapCsvRowToProduct keys
  // on literal Vietnamese header strings ('Mã sản phẩm', 'Tên cửa hàng', …).
  // A different header produces an empty productId on every row, which
  // productOfferScraper.js:117 then silently .filter()s away - no error, no
  // data, nothing in the logs. Capture it verbatim so the mapper can be checked
  // before any crawl code is written.
  report.steps.csvHeaderRaw = lines[0] ?? null;
  report.steps.csvFirstDataRow = lines[1] ?? null;
  report.steps.csvLineCount = lines.filter((l) => l.trim()).length;

  const rows = parseCsvObjects(csvText);
  report.steps.csvParsedRows = rows.length;
  report.steps.csvColumns = rows[0] ? Object.keys(rows[0]) : [];
  const mapped = rows.map(mapCsvRowToProduct);
  // If this is 0 while csvParsedRows is 100, the header names have changed and
  // the mapper needs updating - exactly the silent failure described above.
  report.steps.mappedWithProductId = mapped.filter((p) => p.productId).length;
  report.steps.mappedSample = mapped[0] || null;
  // Free cross-check: does the CSV's own shop column agree with the shop we
  // asked for? If every row carries one shop name, crawling by shop_id is safe.
  report.steps.distinctShopNamesInCsv = [...new Set(mapped.map((p) => p.shopName).filter(Boolean))].slice(0, 5);

  return mapped;
}

async function main() {
  const context = await browserManager.getContext();
  const page = await context.newPage();
  attachListeners(page);

  try {
    log('navigating to', BRAND_OFFER_URL);
    await page.goto(BRAND_OFFER_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // The grid is rendered client-side after the shell loads (same as
    // product_offer's tab bar, see productOfferScraper.js:157-160).
    await page
      .locator('.ItemCard__container')
      .first()
      .waitFor({ state: 'visible', timeout: 20000 })
      .catch(() => log('no .ItemCard__container became visible within 20s'));
    await browserManager.dismissBlockingModals(page);

    // 1. Session still alive?
    const landedUrl = await step('finalUrl', async () => page.url());
    const loggedOut = /passport|login/i.test(landedUrl || '');
    report.steps.loggedOut = loggedOut;
    if (loggedOut) {
      report.errors.push('redirected to login - session is dead, run `npm run seed-login` and retry once');
      return;
    }

    report.steps.pageTitle = await page.title().catch(() => null);

    // 2. Does the grid render, and is one page really ~100 products?
    await step('itemCardCount', async () => page.locator('.ItemCard__container').count());

    // 3. The select-all checkbox - the single most important selector.
    const selectAll = page.getByRole('checkbox', { name: /Chọn tất cả sản phẩm trên trang này/i });
    const selectAllCount = await step('selectAllCheckboxCount', async () => selectAll.count());
    if (!selectAllCount) {
      await step('checkboxesSeen', async () =>
        page.locator('input[type="checkbox"], [role="checkbox"]').evaluateAll((els) =>
          els.slice(0, 10).map((el) => el.outerHTML.slice(0, 200))
        )
      );
    }

    // 4. The bulk-link button - the second most important selector.
    const bulkButton = page.getByRole('button', { name: /Lấy link hàng loạt/i });
    const bulkButtonCount = await step('bulkLinkButtonCount', async () => bulkButton.count());
    if (!bulkButtonCount) {
      await step('buttonsSeen', async () =>
        (await page.getByRole('button').allTextContents()).map((t) => t.trim()).filter(Boolean).slice(0, 40)
      );
    }

    // 5. Pagination shape (we only intend to take page 1, but knowing whether
    //    the pager exists tells us whether "page 1" is even a meaningful unit).
    await step('pagerNextCount', async () => page.locator('.page-next').count());
    await step('pagerNextClass', async () => page.locator('.page-next').first().getAttribute('class').catch(() => null));
    await step('pagerItems', async () =>
      (await page.locator('.page-item').allTextContents()).map((t) => t.trim()).slice(0, 20)
    );

    // 6. Shop metadata rendered on the page - a free cross-check against
    //    GET /api/v3/offer/shop (spec §1.2) without spending an API call.
    await step('headingsOnPage', async () =>
      (await page.locator('h1, h2, h3').allTextContents()).map((t) => t.trim()).filter(Boolean).slice(0, 10)
    );
    await step('percentTextsOnPage', async () =>
      page.evaluate(() => {
        const out = new Set();
        document.querySelectorAll('span, div').forEach((el) => {
          const t = (el.childElementCount === 0 && el.textContent ? el.textContent.trim() : '');
          if (t && /^\d+([.,]\d+)?%$/.test(t)) out.add(t);
        });
        return [...out].slice(0, 10);
      })
    );

    // 7 + 8. The real round trip, and the CSV header verbatim.
    if (DO_BULK_LINK && selectAllCount && bulkButtonCount) {
      await step('bulkLinkRoundTrip', async () => {
        const mapped = await probeBulkLink(page, selectAll, bulkButton);
        return mapped ? `${mapped.length} rows mapped` : 'see bulkOutcome';
      });
    } else {
      report.steps.bulkLinkRoundTrip = DO_BULK_LINK
        ? 'skipped - required selector missing'
        : 'skipped - PROBE_BULK_LINK=0';
    }

    // 9. Does unchecking reset the counter? product_offer's selection is NOT
    //    scoped per page (productOfferScraper.js:73-80) - if brand_offer shares
    //    that behaviour, a multi-page crawl here would need the same toggle-off.
    if (selectAllCount) {
      await browserManager.dismissBlockingModals(page);
      await step('deselectResetsCounter', async () => {
        await selectAll.click();
        await page.waitForTimeout(800);
        return page
          .locator('text=/đã chọn|selected/i')
          .first()
          .textContent()
          .catch(() => '(no counter element)');
      });
    }
  } catch (err) {
    report.errors.push(`fatal: ${err.message}`);
    log('FATAL -', err.stack || err.message);
  } finally {
    report.finishedAt = new Date().toISOString();
    await page.close().catch(() => {});
    // NOTE: no persistStorageState() on purpose - a probe must never write the
    // session back. shutdown() closes the browser so the process can exit.
    await browserManager.shutdown().catch(() => {});
  }
}

main()
  .then(() => {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(report.errors.length ? 1 : 0);
  })
  .catch((err) => {
    report.errors.push(`unhandled: ${err.message}`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(1);
  });
