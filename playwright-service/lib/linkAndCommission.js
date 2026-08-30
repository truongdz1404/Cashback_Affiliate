const { getCustomLinks } = require('./customLink');
const { getCommission } = require('./commission');

/**
 * Generates the affiliate link and, using the itemId that comes back from
 * that same call (see customLink.js), immediately looks up its commission
 * rate - one round trip from the caller's point of view instead of two, and
 * no dependency on the caller having pre-resolved a short link into an
 * itemId itself.
 */
async function getLinkAndCommission(links, subIds) {
  const linkResult = await getCustomLinks(links, subIds);
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
  };
}

module.exports = { getLinkAndCommission };
