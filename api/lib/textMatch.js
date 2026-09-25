// Vietnamese text helpers shared by anything that has to compare a user's
// words against Shopee's. Moved verbatim out of lib/repositories/
// recommendations.js when lib/repositories/shops.js needed the same
// diacritic-folding to rank a shop against a search box - two copies of
// stripDiacritics would drift, and "why does the shop card match but the
// product list doesn't" is a bug nobody would think to look for here.
//
// Nothing in here touches the database or the network on purpose: these are
// the only rules that decide whether two pieces of Vietnamese text are "the
// same", so they stay pure and cheap to reason about.

// Vietnamese product titles are noisy with size/color/generic-hype words that
// would otherwise dominate the keyword overlap score (e.g. "chính hãng",
// "cao cấp" show up on nearly everything) - stripping them out leaves the
// words that actually describe *what the product is*.
const STOPWORDS = new Set([
  'va', 'cho', 'cua', 'cac', 'nhung', 'mot', 'la', 'co', 'khong', 'tai',
  'chinh', 'hang', 'cao', 'cap', 'sieu', 'gia', 're', 'moi', 'set', 'bo',
  'chiec', 'cai', 'loai', 'mau', 'size', 'combo', 'tang', 'kem', 'theo',
  'voi', 'duoc', 'nay', 'hot', 'trend', 'form', 'freeship', 'sale',
]);

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd');
}

// addlivetag and the scraper each format shop/category names slightly
// differently (e.g. trailing spaces from Shopee's own listing markup), so an
// exact-string match would silently miss real matches. Trimming and
// collapsing whitespace before using these as map keys avoids that.
function normalizeName(s) {
  return s ? s.trim().replace(/\s+/g, ' ') : s;
}

function tokenize(text) {
  if (!text) return [];
  return stripDiacritics(text.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

// The same words tokenize() keeps, but with their diacritics left ON.
//
// tokenize() folds "Sắc" down to "sac", which is the right thing when both
// sides of the comparison are already in memory, and the wrong thing when one
// side is a SQL LIKE against Shopee's own titles: nothing in the catalogue is
// spelled "sac", so a folded token pre-filters to zero rows. Both the user's
// history and the catalogue come from Shopee, so the accented word matches
// literally - which is what makes it usable as a database filter.
function rawTokens(text) {
  if (!text) return [];
  return String(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(stripDiacritics(word.toLowerCase())));
}

// Lowercased, diacritic-free, whitespace-collapsed - the form to compare two
// names in when "Cửa Hàng ABC" and "cua hang abc" must count as equal.
//
// This is for SEARCH ONLY. The shop-name resolution job deliberately does the
// opposite (lib/shopResolution.js compares names byte for byte after a trim):
// guessing which shop a product belongs to is a money decision and must never
// be fuzzy, while ranking a shop card against what someone typed should be.
function foldForSearch(s) {
  return stripDiacritics(String(s || '').toLowerCase()).trim().replace(/\s+/g, ' ');
}

// The words a *phrase* is built out of, which is a different cut than
// tokenize(): the minimum length is 2, not 3.
//
// Three characters was the right floor when a token scored on its own - a
// two-letter fragment matches far too much to mean anything by itself. It is
// the wrong floor for building pairs, because Vietnamese writes its head
// nouns short: "ao", "vi", "noi", "son", "tui". Dropping them did not just
// lose those words, it broke every pair they belong to - "ao thun", "vi nam",
// "noi chien" - which are exactly the phrases that say what a product IS.
//
// `accented` leaves the diacritics on, for the same reason rawTokens does:
// folded text cannot be matched against Shopee's own titles in SQL.
function contentWords(text, { accented = false } = {}) {
  if (!text) return [];
  const source = accented ? String(text) : foldForSearch(text);
  return source
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 2 && !STOPWORDS.has(foldForSearch(word)));
}

// Adjacent word pairs - the unit the recommender actually matches on.
//
// A single Vietnamese syllable is close to meaningless on its own once the
// diacritics are folded away: "day" is both "dây" (cord) and "dày" (thick),
// "the" is "thẻ"/"thế"/"thể", "vai" is "vải"/"vai"/"vài". Scoring products on
// those was why a feed built from lipstick links filled up with phone cases -
// every one of them shared a syllable with something. A pair has to agree on
// two syllables in order, which is a claim about the product rather than a
// coincidence of spelling.
function bigrams(text, { accented = false } = {}) {
  const parts = contentWords(text, { accented });
  const out = [];
  for (let i = 0; i + 1 < parts.length; i += 1) {
    out.push(`${parts[i]} ${parts[i + 1]}`.toLowerCase());
  }
  return out;
}

// True when `needle` appears in `haystack` as a whole word (or whole phrase),
// not merely as a substring. Both sides must already be in the same form -
// both folded, or both merely lowercased.
//
// Substring matching is what made an "exact" search-term match useless:
// "dep" is inside "depot" and "ao" is inside "bao", "gao", "cao"; the term
// scored on products that have nothing to do with it. Checking the characters
// on either side costs one test and removes the entire class.
function containsWhole(haystack, needle) {
  if (!haystack || !needle) return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? ' ' : haystack[at - 1];
    const end = at + needle.length;
    const after = end >= haystack.length ? ' ' : haystack[end];
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
    from = at + 1;
  }
}

module.exports = {
  STOPWORDS,
  stripDiacritics,
  normalizeName,
  tokenize,
  rawTokens,
  foldForSearch,
  contentWords,
  bigrams,
  containsWhole,
};
