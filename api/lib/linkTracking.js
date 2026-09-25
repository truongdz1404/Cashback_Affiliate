const { LINK_SOURCES } = require('./linkSources');
const users = require('./repositories/users');
const linksRepo = require('./repositories/links');
const shopsRepo = require('./repositories/shops');
const recommendationsRepo = require('./repositories/recommendations');
const prisma = require('./prisma');

// Called before generating the Shopee custom link. If a zaloUserId is
// supplied, mints a fresh sub_id and injects it as subId1 (the mechanism
// customLink.js already supports) so the order can later be matched back to
// this user via utm_content in the conversion report.
//
// subId2 carries WHERE the link was made - see lib/linkSources.js. Slot 2
// rather than any other because slot 1 is the identity and must not move: the
// reconciliation reader has been splitting utm_content and taking [0] since
// before this existed, and it keeps working untouched.
async function prepareSubId(zaloUserId, subIds, source = LINK_SOURCES.ZALO) {
  if (!zaloUserId) return { finalSubIds: subIds, userId: null, subId: null, source };

  const user = await users.getOrCreateUserByZaloId(zaloUserId);
  const subId = linksRepo.generateSubId();
  return {
    // Source is the DEFAULT for slot 2, not an override. /custom-link and
    // /link-and-commission let their caller (n8n, the Zalo flows) pass its own
    // subIds, and silently replacing a slot someone is already using would
    // break their reporting to fix ours.
    finalSubIds: { sub_id2: source, ...(subIds || {}), sub_id1: subId },
    userId: user.id,
    subId,
    source,
  };
}

// The same thing for a user we already hold by id, which is every caller behind
// appAuth.requireAppUser. Those callers used to pass `user.zaloUserId` into
// prepareSubId above, and an account created through email / Google / Facebook
// has none - so the minted link carried NO sub id at all and a resulting order
// could never be matched back to the buyer in reconciliation.js. Everything
// still worked and looked fine; the cashback just silently never arrived.
function prepareSubIdForUser(userId, subIds, source) {
  if (!userId) return { finalSubIds: subIds, userId: null, subId: null, source };

  const subId = linksRepo.generateSubId();
  return {
    finalSubIds: { sub_id2: source, ...(subIds || {}), sub_id1: subId },
    userId: Number(userId),
    subId,
    source,
  };
}

// Persists the generated link once the Shopee call has returned, so it can
// be looked up by sub_id during order reconciliation. `estimate` (userAmount/
// userPct) is stored alongside so the app's link history can show the same
// figure the user saw right after creating the link.
// Takes the whole `tracking` object rather than its pieces so the source
// stored on the row cannot drift from the source minted into subId2 - they are
// the same field read twice, and a report that disagrees with the link it
// describes is worse than no report.
async function recordLink(tracking, productLinks, result, fallbackItemId, estimate, meta) {
  const { userId, subId, source = null } = tracking;
  const first = (result && result.results && result.results[0]) || null;
  const itemId = (first && first.itemId) || fallbackItemId || null;
  await linksRepo.saveLink({
    userId,
    subId,
    source,
    itemId,
    shopeeUrl: Array.isArray(productLinks) ? productLinks[0] : null,
    affiliateUrl: first ? first.shortLink || first.longLink : null,
    estimatedAmount: estimate ? estimate.userAmount : null,
    estimatedPct: estimate ? estimate.userPct : null,
    itemName: meta ? meta.itemName : null,
    catId: meta ? meta.catId : null,
    catName: meta ? meta.catName : null,
    shopName: meta ? meta.shopName : null,
    shopId: await resolveLinkShopId(meta, itemId),
    priceValue: meta ? meta.priceValue : null,
    imageUrl: meta ? meta.imageUrl : null,
  });
  // This row is the newest and heaviest signal the recommendation scoring has,
  // so any ordering cached before it is out of date. Suggestions are a feed the
  // user scrolls now; they should reflect what was just tapped.
  recommendationsRepo.invalidateFeedOrder(userId);
}

// links.shop_id is a foreign key onto shops.shop_id (added in
// migrations/20260924000000_add_link_shop_and_hot_path_indexes), so a shop id
// we cannot vouch for is not a worse row - it is a failed INSERT, and the user
// gets a 502 on a link that was already built. That is what this guards: the
// commission lookup hands back the shop of ANY product a user pastes, and most
// of those shops have never been crawled, so they are not in `shops` yet.
//
// repositories/shops.js#ensureFromProduct exists for exactly this situation on
// the shopping_products side and is reused verbatim here: it creates the bare
// id+name row from what the commission lookup already gave us for free, leaves
// an existing row untouched, and defaults to status 'discovered' so a shop with
// no avatar never surfaces in the app.
//
// Anything it cannot vouch for degrades to null rather than throwing. A null
// shop_id costs the recommendation engine one join; a throw costs the user
// their link.
async function resolveLinkShopId(meta, itemId) {
  const fromMeta = meta && meta.shopId ? String(meta.shopId) : null;
  if (fromMeta) {
    const ensured = await shopsRepo
      .ensureFromProduct({ shopId: fromMeta, name: meta.shopName })
      .catch(() => null);
    if (ensured) return fromMeta;

    // No shop name to create the row with - only usable if it is already known.
    const known = await prisma.shop
      .findUnique({ where: { shopId: fromMeta }, select: { shopId: true } })
      .catch(() => null);
    if (known) return fromMeta;
  }

  // The catalog is populated through the same foreign key, so a shop id read
  // back out of it is always present in `shops`.
  return resolveShopId(itemId);
}

// Callers that already know the shop (the Shopping tab, where the product row
// carries it) pass it in meta. A pasted link does not: Shopee's commission
// lookup returns a shop NAME and nothing else, which only matches by string.
// If we happen to have scraped that item, the catalog knows its real shop id,
// so look it up once here rather than leaving the column null and re-deriving
// it on every recommendation request afterwards. One indexed point lookup
// next to a link mint that already cost seconds of Shopee round trip.
async function resolveShopId(itemId) {
  if (!itemId) return null;
  try {
    const row = await prisma.shoppingProduct.findUnique({
      where: { productId: String(itemId) },
      select: { shopId: true },
    });
    return (row && row.shopId) || null;
  } catch {
    // Best effort only - never fail a user's link because of an enrichment.
    return null;
  }
}

module.exports = { prepareSubId, prepareSubIdForUser, recordLink };
