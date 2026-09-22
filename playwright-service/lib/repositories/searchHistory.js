const prisma = require('../prisma');

// How many recent terms buildAffinity() looks at - same order of magnitude
// as LINK_HISTORY_LIMIT's role for links, just smaller since search intent
// drifts faster than purchase intent.
const RECENT_TERMS_LIMIT = 10;

// Fire-and-forget from server.js on every /app/shopping-products call that
// carries a search term - skips single-char noise (debounced client-side,
// but the first keystroke or two still reach here) and immediate repeats
// (the same debounced term re-fetched for pagination/refetch) so the table
// tracks distinct search intents rather than every request.
async function record(userId, term) {
  const trimmed = term && term.trim();
  if (!trimmed || trimmed.length < 2) return;

  const last = await prisma.searchHistory.findFirst({
    where: { userId: Number(userId) },
    orderBy: { createdAt: 'desc' },
  });
  if (last && last.term === trimmed) return;

  await prisma.searchHistory.create({ data: { userId: Number(userId), term: trimmed } });
}

async function recentTerms(userId, limit = RECENT_TERMS_LIMIT) {
  const rows = await prisma.searchHistory.findMany({
    where: { userId: Number(userId) },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((r) => r.term);
}

module.exports = { record, recentTerms };
