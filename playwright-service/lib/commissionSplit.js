const settingsRepo = require('./repositories/settings');

// Per-user commission_pct (set via the admin dashboard) takes priority over
// the system-wide default; users without an override fall back to it.
function getEffectivePct(user) {
  if (user && user.commission_pct !== null && user.commission_pct !== undefined) {
    return Number(user.commission_pct);
  }
  return settingsRepo.getCommissionPct();
}

function splitAmount(totalAmount, pct) {
  const userAmount = (totalAmount * pct) / 100;
  return { userAmount, operatorAmount: totalAmount - userAmount };
}

module.exports = { getEffectivePct, splitAmount };
