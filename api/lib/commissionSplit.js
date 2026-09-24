const settingsRepo = require('./repositories/settings');

// Per-user commission_pct (set via the admin dashboard) takes priority over
// the system-wide default; users without an override fall back to it.
async function getEffectivePct(user) {
  if (user && user.commissionPct !== null && user.commissionPct !== undefined) {
    return Number(user.commissionPct);
  }
  return settingsRepo.getCommissionPct();
}

function splitAmount(totalAmount, pct) {
  const userAmount = (totalAmount * pct) / 100;
  return { userAmount, operatorAmount: totalAmount - userAmount };
}

// Shared by the /app/link route and the Zalo bot reply: pick the "Mạng xã
// hội" row from the commission table (falling back to the first row) and
// split it by the user's effective %, so both surfaces - and whatever gets
// persisted to link history - show the exact same figure.
function estimateFromResult(result, pct) {
  const table = (result.commission && result.commission.commissionTable) || [];
  const social = table.find((r) => (r.channel || '').includes('Mạng xã hội')) || table[0] || null;
  if (!social || social.totalAmount === null || social.totalAmount === undefined) return null;

  const { userAmount } = splitAmount(social.totalAmount, pct);
  const userPct = social.totalPct === null || social.totalPct === undefined ? null : (social.totalPct * pct) / 100;
  return { userAmount, userPct };
}

module.exports = { getEffectivePct, splitAmount, estimateFromResult };
