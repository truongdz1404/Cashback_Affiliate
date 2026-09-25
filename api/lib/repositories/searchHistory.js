const prisma = require('../prisma');

// How many recent terms buildAffinity() looks at - same order of magnitude
// as LINK_HISTORY_LIMIT's role for links, just smaller since search intent
// drifts faster than purchase intent.
const RECENT_TERMS_LIMIT = 10;
// recentTerms() de-duplicates, so it has to read more rows than it returns to
// still fill the limit when a user searched the same thing repeatedly.
const RECENT_TERMS_SCAN = 60;

// Fire-and-forget from server.js on every /app/shopping-products call that
// carries a search term - skips single-char noise (debounced client-side,
// but the first keystroke or two still reach here) and immediate repeats
// (the same debounced term re-fetched for pagination/refetch) so the table
// tracks distinct search intents rather than every request.
//
// It also collapses a term the user is still typing into a single row.
// Debouncing only thins the keystrokes, it does not stop each pause from
// landing as its own row, so one search for "ao khoac nam" used to arrive as
// "ao", "ao kh", "ao khoac", "ao khoac nam" - four rows for one intent. With
// RECENT_TERMS_LIMIT at 10 that meant two or three searches could fill the
// entire recent-terms window with prefixes of each other, which is exactly
// the "everything comes from the last thing I did" effect the recommendation
// scoring was showing. When the new term extends the previous one (or the
// user is backspacing, so the previous one extends it), the previous row is
// updated in place instead.
async function record(userId, term) {
  const trimmed = term && term.trim();
  if (!trimmed || trimmed.length < 2) return;

  const last = await prisma.searchHistory.findFirst({
    where: { userId: Number(userId) },
    orderBy: { createdAt: 'desc' },
  });
  if (last && last.term === trimmed) return;

  if (last && isTypingSameTerm(last.term, trimmed)) {
    // createdAt is deliberately left alone: this is still the same search,
    // started when the user began typing it.
    await prisma.searchHistory.update({ where: { id: last.id }, data: { term: trimmed } });
    return;
  }

  await prisma.searchHistory.create({ data: { userId: Number(userId), term: trimmed } });
}

// Two terms are the same search mid-typing when one is a prefix of the other,
// compared case-insensitively. Deliberately a prefix test and not a fuzzy
// distance: "ao" and "ao khoac" are one search, "ao khoac" and "ao so mi" are
// two, and anything cleverer would start merging genuinely different intents.
function isTypingSameTerm(previous, next) {
  const a = String(previous || '').toLowerCase();
  const b = next.toLowerCase();
  return a.length > 0 && (b.startsWith(a) || a.startsWith(b));
}

// Most recent first, one entry per distinct term. Without the de-duplication
// a user who searches "sua rua mat" every morning would spend their whole
// affinity window on that one term.
//
// Returns rows, not bare strings: buildAffinity() now orders a search and a
// link against each other by when they actually happened, so it needs the
// timestamp. Keeping the FIRST row of each duplicated term (the most recent
// one, since the scan is newest-first) is what dates the term.
async function recentSearches(userId, limit = RECENT_TERMS_LIMIT) {
  const rows = await prisma.searchHistory.findMany({
    where: { userId: Number(userId) },
    orderBy: { createdAt: 'desc' },
    take: RECENT_TERMS_SCAN,
  });

  const seen = new Set();
  const searches = [];
  for (const row of rows) {
    const key = String(row.term || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    searches.push({ term: row.term, createdAt: row.createdAt });
    if (searches.length >= limit) break;
  }
  return searches;
}

// Emptying the recent-terms row on the search screen. Deliberately a real
// delete rather than a "hidden" flag: the same rows feed buildAffinity(), so
// a user who clears their history expects the recommendations built on it to
// stop following them around too.
async function clearAll(userId) {
  await prisma.searchHistory.deleteMany({ where: { userId: Number(userId) } });
}

module.exports = { record, recentSearches, clearAll, RECENT_TERMS_LIMIT };
