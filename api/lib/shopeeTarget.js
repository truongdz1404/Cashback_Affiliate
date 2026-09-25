// Turns whatever a user pasted into the { kind, shopId, itemId } that
// lib/anRedirLink.js needs, without opening a browser.
//
// This is the piece that was missing before. lib/affiliateLink.js's
// parseShopeeUrl already reads every *long* shape Shopee produces, but the
// share sheet in the Shopee app hands out a short link, and that is what
// people actually paste - 40 of the 72 real URLs in the links table (56%),
// against 32 that parse with no network at all. Resolving those short links
// was the only reason the paste path still needed lib/customLink.js's
// Playwright tab: Shopee's own "Lấy link" page happens to return an itemId,
// so we were driving a whole browser to learn two numbers that one HTTP
// redirect already tells us.
//
// Measured on a live share link (Sep 2026): exactly one 301, straight to the
// canonical form, no JavaScript and no interstitial -
//
//   GET https://vn.shp.ee/y6on5sRY
//   301 -> https://shopee.vn/product/636877211/27389650464?d_id=..&utm_content=ptQxQh5..
//
// Note the utm_content on that redirect. A pasted share link carries whoever
// shared it; we keep only the two ids and rebuild the URL from them, so their
// tracking cannot ride along into the link we mint. That is the same
// re-attribution Shopee's own "Lấy link" page performs on a pasted link
// today, so nothing about who gets paid changes here.
//
// SECURITY: `raw` comes from a request body, and following it means this
// server makes an outbound request to a user-chosen URL. Every hop is checked
// against the host allow-list below BEFORE it is fetched, redirects are
// followed by hand (redirect: 'manual') rather than by fetch, and the chain is
// capped - so a short link cannot be used to walk us onto an internal address.
const { parseShopeeUrl } = require('./affiliateLink');

// Shopee's share sheet is regional and has changed shape over time: the
// Vietnamese app emits vn.shp.ee today, s.shopee.vn is what the older rows
// and Shopee's own documentation use, shope.ee appears too, and every region
// prefixes its own subdomain. Anchored on the suffix, so shp.ee.evil.com and
// shopee.vn.evil.com are not matches.
//
// isFollowable() below is the single gate: it decides both whether a pasted
// URL is worth following at all and whether each hop it leads to may be
// fetched. Having those as two different rules is what silently dropped
// s.shopee.vn on the first cut of this - 12 of 39 real short links in the
// links table, every one of them resolvable.
const SHORT_LINK_HOST = /(^|\.)(?:shp\.ee|shope\.ee)$/i;
const SHOPEE_HOST = /(^|\.)shopee\.vn$/i;

// One hop is what a share link actually costs; the rest is headroom for
// Shopee putting a regional bounce in front of it, not an invitation to walk
// a chain.
const MAX_HOPS = 4;

// A budget for the whole resolve, not per hop, because what has to stay
// bounded is the request the user is waiting on. This runs BEFORE the
// browser fallback, so its worst case is added to that path, and the app
// gives the whole call 15s (network.requestTimeoutMs in the mobile client)
// while Playwright alone already takes 2-6s.
//
// 3s is ~4x the slowest resolve measured over all 39 real short links in the
// links table, run from the VPS itself: p50 78ms, p95 279ms, max 752ms. Four
// hops at a per-hop timeout would have allowed 20s and blown the budget on a
// path that is supposed to be the fast one.
const TOTAL_BUDGET_MS = 3000;

// Do NOT put a phone in here, however natural that looks for a link that a
// phone is going to open. Same short link, same second (Sep 2026):
//
//   no user-agent / curl / desktop Chrome  -> 301 + Location, the ids in hand
//   iOS Safari 17 / Android Chrome 133     -> 200 and an HTML page
//
// The 200 is Shopee's "open in the app" interstitial: it deep-links into the
// installed app instead of redirecting, so the ids never appear in a header
// and the resolve silently fails. We are a server reading an id, not a buyer
// opening a product - so ask as one. This is the same desktop string
// lib/customLink.js uses.
const RESOLVER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

function isFollowable(hostname) {
  return SHOPEE_HOST.test(hostname) || SHORT_LINK_HOST.test(hostname);
}

function toUrl(raw) {
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
}

/**
 * @param {string} raw whatever the user pasted
 * @returns {Promise<{kind:'product'|'shop', shopId:string, itemId?:string}|null>}
 *   null for anything not recognisable as a Shopee product/shop - the caller
 *   falls back to the browser path, which is still the only thing that can
 *   make sense of a shape neither this nor parseShopeeUrl knows.
 */
async function resolveShopeeTarget(raw) {
  if (!raw) return null;

  // The free case: a long URL needs no network at all.
  const direct = parseShopeeUrl(raw);
  if (direct) return direct;

  let url = toUrl(raw);
  if (!url || !isFollowable(url.hostname)) return null;

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;

    let response;
    try {
      response = await fetch(url.toString(), {
        redirect: 'manual',
        headers: { 'user-agent': RESOLVER_UA, accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(remaining),
      });
    } catch {
      // Timeout, DNS, TLS - all mean the same thing to the caller.
      return null;
    }
    // Nothing here reads the body; releasing it keeps the socket from being
    // held open for the request's lifetime.
    await response.body?.cancel().catch(() => {});

    const location = response.headers.get('location');
    if (!location) return null;

    let next;
    try {
      next = new URL(location, url);
    } catch {
      return null;
    }
    // Checked before the next fetch, not after: this is the line that stops a
    // redirect from steering us somewhere we would not have gone ourselves.
    if (next.protocol !== 'https:' && next.protocol !== 'http:') return null;
    if (!isFollowable(next.hostname)) return null;

    const parsed = parseShopeeUrl(next.toString());
    if (parsed) return parsed;
    url = next;
  }

  return null;
}

module.exports = { resolveShopeeTarget, isFollowable };
