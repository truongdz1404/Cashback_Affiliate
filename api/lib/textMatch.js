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

module.exports = { STOPWORDS, stripDiacritics, normalizeName, tokenize, foldForSearch };
