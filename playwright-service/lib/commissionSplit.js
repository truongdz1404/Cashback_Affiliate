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

module.exports = { getEffectivePct, splitAmount };
