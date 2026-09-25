const { getCustomLinks } = require('./customLink');
const { getCommission } = require('./commission');
const { buildAnRedirLink, useAnRedir } = require('./anRedirLink');
const { resolveShopeeTarget } = require('./shopeeTarget');
const shopeeAffiliateApi = require('./shopeeAffiliateApi');
const settingsRepo = require('./repositories/settings');

/**
 * Mints the link by string concatenation instead of driving Shopee's
 * dashboard, for the links we can identify ourselves.
 *
 * getCustomLinks() was doing two jobs for this caller: producing the link,
 * and telling us the itemId. lib/shopeeTarget.js now answers the second for
 * free (one redirect, or none at all for a long URL), and an_redir answers
 * the first with no request to Shopee whatsoever - so the Playwright tab,
 * which costs 2-6s of a two-core box and is the last browser left in the
 * happy path of POST /app/link, drops out. getCommission() below is
 * unaffected: it already prefers a plain fetch to addlivetag.
 *
 * On why this is not lib/customLink.js's getCustomLinksViaFetch, which was
 * deliberately switched off for looking like anti-fraud evasion: that one
 * called Shopee's private batchCustomLink endpoint while skipping the
 * af-ac-enc-* tokens its own page attaches. This calls nothing. an_redir is
 * a URL format Shopee publishes in its help centre for affiliates to build
 * by hand, and the click is then handled by Shopee's own redirector, from
 * the buyer's real device and IP, rather than minted here from one shared
 * session. If anything it is the less synthetic of the two traffic patterns.
 *
 * Returns null - not a throw - for anything it cannot do, so the caller
 * simply carries on down the old path.
 */
async function buildViaAnRedir(links, subIds) {
  if (!Array.isArray(links) || links.length === 0) return null;

  const percent = await settingsRepo.getAnRedirPercent();
  if (!useAnRedir(subIds && subIds.sub_id1, percent)) return null;

  // All or nothing per call. /link-and-commission accepts up to five URLs,
  // and a batch half on one mechanism and half on the other would make the
  // rollout comparison unreadable for the sake of saving one browser trip
  // that the unresolvable URL is going to cost anyway.
  const targets = [];
  for (const link of links) {
    const target = await resolveShopeeTarget(link);
    if (!target) return null;
    targets.push(target);
  }

  const affiliateId = await shopeeAffiliateApi.getAffiliateId();
  const results = [];
  for (const target of targets) {
    const url = buildAnRedirLink({ target, affiliateId, subIds });
    if (!url) return null;
    results.push({
      shortLink: url,
      longLink: url,
      shopId: target.shopId,
      // A shop link has no item, exactly as the browser path reports it -
      // getCommission is skipped below and the row stores a null item_id,
      // which is what shop links already do today.
      itemId: target.kind === 'product' ? target.itemId : null,
      failCode: null,
    });
  }

  // Same keys getCustomLinks returns, so every caller downstream - the /app/link
  // response the app parses, lib/linkTracking.js's recordLink, the Zalo reply -
  // reads it without knowing which branch produced it. `source` is the one
  // honest difference and is only ever logged.
  return { links, subIds: subIds || null, source: 'an_redir', results };
}

/**
 * Generates the affiliate link and, using the itemId that comes back from
 * that same call, immediately looks up its commission rate - one round trip
 * from the caller's point of view instead of two, and no dependency on the
 * caller having pre-resolved a short link into an itemId itself.
 */
async function getLinkAndCommission(links, subIds) {
  let linkResult = null;
  try {
    linkResult = await buildViaAnRedir(links, subIds);
  } catch (err) {
    console.error(`[linkAndCommission] an_redir không dựng được (${err.message}), quay lại đường Playwright.`);
  }
  if (!linkResult) linkResult = await getCustomLinks(links, subIds);

  const first = (linkResult.results || []).find((r) => r.itemId) || linkResult.results?.[0] || null;

  let commission = null;
  if (first && first.itemId) {
    const start = Date.now();
    commission = await getCommission(first.itemId).catch((err) => ({ error: err.message }));
    console.log(`[linkAndCommission] getCommission took ${Date.now() - start}ms (source=${commission?.source})`);
  }

  return {
    ...linkResult,
    pid: first ? first.itemId : null,
    commission,
    meta: commission && !commission.error ? commission.meta ?? null : null,
  };
}

module.exports = { getLinkAndCommission };
