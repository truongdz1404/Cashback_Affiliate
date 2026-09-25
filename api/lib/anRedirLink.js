// Builds a Shopee affiliate link in the `an_redir` form - the one shape of
// affiliate link Shopee actually documents.
//
//   https://s.shopee.vn/an_redir?origin_link=<encoded>&affiliate_id=<id>&sub_id=<a-b-c-d-e>
//
// Why this exists next to lib/affiliateLink.js, which already produces a
// working link: affiliateLink.js is reverse-engineered. Its output was
// compared byte-for-byte against Shopee's own `long_link` and matched, but
// nothing published says it has to keep matching, and the day Shopee changes
// a key order or adds a parameter we would not find out - the links would
// keep resolving and quietly stop being attributed. an_redir is printed in
// Shopee's own help centre, so it is a contract rather than an observation.
//
// It is also what the landing URL says is different. Following both to their
// destination (product 1303911660/26331862811, Sep 2026):
//
//   an_redir     -> /product/...?affiliate_id=..&credential_token=3fbCux..
//                   &mmp_pid=an_..&sub_id=..&uls_trackid=..&utm_content=..
//                   &utm_medium=affiliates&utm_source=an_..&utm_term=..
//   self-built   -> /product/...?uls_trackid=..&utm_campaign=-&utm_content=..
//                   &utm_medium=affiliates&utm_source=an_..
//
// The self-built link arrives with the utm_* set and nothing else. The
// an_redir link arrives with the same utm_* PLUS `credential_token` and
// `mmp_pid` - values only Shopee can mint, on a click Shopee itself handled.
// We do not know that those are what attribution is checked against, but we
// do know we cannot produce them, and docs/shopee-affiliate-api-spec.txt §8
// still records that nobody has confirmed a self-built link ever paid out.
//
// The sub_id round-trips verbatim into utm_content, which is the field
// reconciliation.js already reads - so nothing downstream changes. Verified
// on the same click: sub_id=anrdA-slot2-slot3-slot4-slot5 came back as
// utm_content=anrdA-slot2-slot3-slot4-slot5.
//
// NOTE on the format: Shopee's guide writes the step as "append
// `?&affiliate_id=...` to the encoded link", and taken literally that
// produces a link that still works but lands on /opaanlp/<shop>/<item>
// ?__mobile__=1 - a mobile interstitial, not the product page. The guide's
// own finished example has no `?&` in it. Encode origin_link fully and keep
// affiliate_id/sub_id as ordinary outer parameters, as below.
const { parseShopeeUrl, encodeSubIds } = require('./affiliateLink');

const AN_REDIR_ORIGIN = 'https://s.shopee.vn';

/**
 * @param {{target: string|{kind:'shop'|'product', shopId:string, itemId?:string}, affiliateId: string|number, subIds?: string[]}} args
 * @returns {string|null} null when the target is not a Shopee URL we recognise
 *   or when no affiliate id is available - callers fall back as they did before.
 */
function buildAnRedirLink({ target, affiliateId, subIds = [] }) {
  const parsed = typeof target === 'string' ? parseShopeeUrl(target) : target;
  if (!parsed || !affiliateId) return null;

  // Two shapes for sub ids are already in circulation: lib/shopLink.js
  // passes an array, lib/linkTracking.js mints { sub_id1..sub_id5 } because
  // that is what customLink.js sends Shopee. Accept both rather than make
  // every call site remember which one it is holding.
  const slots = Array.isArray(subIds)
    ? subIds
    : Array.from({ length: 5 }, (_, i) => (subIds || {})[`sub_id${i + 1}`] || '');

  // The plain public URL, not our /universal-link/ form: origin_link is where
  // Shopee sends the buyer after it has recorded the click, and it re-attaches
  // the tracking itself.
  const origin =
    parsed.kind === 'product'
      ? `https://shopee.vn/product/${parsed.shopId}/${parsed.itemId}`
      : `https://shopee.vn/shop/${parsed.shopId}`;

  const query = [
    ['origin_link', origin],
    ['affiliate_id', String(affiliateId)],
    ['sub_id', encodeSubIds(slots)],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return `${AN_REDIR_ORIGIN}/an_redir?${query}`;
}

// Rollout dial, 0-100. Off by default: until a real order placed through an
// an_redir link shows its sub id in the conversion report, this is a promising
// format and not a proven one, and the link that pays today is the one the
// Playwright path mints.
function anRedirPercent() {
  const raw = Number(process.env.SHOPEE_AN_REDIR_PERCENT);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.trunc(raw)));
}

/**
 * Decides the branch for one link, deterministically from `key` (the sub id).
 *
 * Deterministic rather than random so the same link is the same link: the app
 * re-serves a link it minted minutes ago (findRecentByUserAndItem), and a
 * coin flip per call would hand the same user two different URLs for one
 * product and make the comparison unreadable afterwards.
 *
 * Which branch a link took is recoverable without storing a flag - an
 * an_redir row's affiliate_url starts with s.shopee.vn/an_redir - so there is
 * no schema change here and no marker burned into a sub id slot.
 */
function useAnRedir(key) {
  const percent = anRedirPercent();
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  if (!key) return false;

  let hash = 0;
  const text = String(key);
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 1000003;
  }
  return hash % 100 < percent;
}

module.exports = { buildAnRedirLink, useAnRedir, anRedirPercent, AN_REDIR_ORIGIN };
