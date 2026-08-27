const users = require('./repositories/users');
const linksRepo = require('./repositories/links');

// Called before generating the Shopee custom link. If a zaloUserId is
// supplied, mints a fresh sub_id and injects it as subId1 (the mechanism
// customLink.js already supports) so the order can later be matched back to
// this user via utm_content in the conversion report.
function prepareSubId(zaloUserId, subIds) {
  if (!zaloUserId) return { finalSubIds: subIds, userId: null, subId: null };

  const user = users.getOrCreateUserByZaloId(zaloUserId);
  const subId = linksRepo.generateSubId();
  return {
    finalSubIds: { ...(subIds || {}), sub_id1: subId },
    userId: user.id,
    subId,
  };
}

// Persists the generated link once the Shopee call has returned, so it can
// be looked up by sub_id during order reconciliation.
function recordLink(userId, subId, productLinks, result, fallbackItemId) {
  const first = (result && result.results && result.results[0]) || null;
  linksRepo.saveLink({
    userId,
    subId,
    itemId: (first && first.itemId) || fallbackItemId || null,
    shopeeUrl: Array.isArray(productLinks) ? productLinks[0] : null,
    affiliateUrl: first ? first.shortLink || first.longLink : null,
  });
}

module.exports = { prepareSubId, recordLink };
