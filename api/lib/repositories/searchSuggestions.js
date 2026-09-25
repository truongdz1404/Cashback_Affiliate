const prisma = require('../prisma');
const { STOPWORDS, foldForSearch } = require('../textMatch');

// What the search screen shows before and while someone types: the keyword
// cards under "Gợi ý tìm kiếm", and the typeahead list once there is a query.
//
// Both are answered straight out of Postgres on purpose. The catalogue is
// ~90k rows with a pg_trgm GIN index on `name_folded`, which puts a
// LIKE '%...%'
// at 6-85ms - a search engine would sit in front of that to save tens of
// milliseconds while costing a JVM heap on a box that is already running
// Postgres, RabbitMQ, n8n and a headless browser. The part that actually
// needs to get better is *ranking for this user*, and that is decided by
// lib/repositories/recommendations.js off link and search history, which no
// amount of retrieval machinery supplies.

// How many matching product names one keystroke reads. The suggestions are
// the phrases that repeat across this sample, so it has to be big enough for
// "repeats" to mean something and small enough to stay off the critical path.
const SAMPLE_ROWS = 300;
// Longest suggestion, counted in words after the query. Past four the phrase
// stops being a search anyone would run and turns into one product's title.
const MAX_PHRASE_WORDS = 4;
// A phrase seen once is one seller's wording, not a way people search.
const MIN_PHRASE_FREQ = 2;
// How many of the user's own past searches one keystroke reads before
// filtering them. They are filtered in JS rather than in SQL because
// search_history has no folded column of its own: a handful of rows per user
// is not worth a third generated column, and folding them here is what lets
// someone who searched "váy" find it back by typing "vay".
const HISTORY_SCAN = 60;
// Recent categories that steer the keyword cards.
const AFFINITY_LINKS = 50;
// Keyword cards are the same for everyone except their order, so the counting
// query runs at most this often rather than once per opened search screen.
const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_POOL = 40;

// A suggestion has to be something the user can read back as a search, so
// trailing junk gets trimmed: filler words ("cho", "loại"), bare numbers, and
// the size/colour codes that Shopee titles are padded with.
function usableWord(word) {
  if (!word || word.length < 2) return false;
  if (/^\p{N}+$/u.test(word)) return false;
  return !STOPWORDS.has(foldForSearch(word));
}

function splitWords(text) {
  return String(text || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Turns one product name into the search phrases it could stand behind.
 *
 * Every phrase starts where the query starts a word and extends one word at
 * a time, so the query stays the head of every line and the list scans as one
 * column of prefixes. The word-start rule is what keeps "son" off "WILSON":
 * a query landing mid-word is a coincidence of spelling, not a search.
 *
 * Matching happens on the folded form of each word, display comes from the
 * raw one - someone typing "dien thoai" gets "điện thoại ..." offered back
 * with its tones intact. Folding changes lengths ("điện" -> "dien"), so the
 * positions are computed over the folded words rather than carried across
 * from the raw string; that is the whole reason this walks words instead of
 * calling indexOf on the name.
 */
function phrasesFrom(name, foldedQuery) {
  const words = splitWords(name);
  if (!words.length) return [];

  const folded = words.map(foldForSearch);
  // Where each word begins inside `hay`. Built here rather than searched for,
  // because a word-start offset is exactly the "query must start a word" rule
  // and reading it off a join() is cheaper than re-scanning the string.
  const starts = [];
  let cursor = 0;
  for (const word of folded) {
    starts.push(cursor);
    cursor += word.length + 1; // +1 for the single space join() puts in
  }
  const hay = folded.join(' ');

  let at = -1;
  for (let i = 0; i < starts.length; i += 1) {
    if (hay.startsWith(foldedQuery, starts[i])) {
      at = i;
      break;
    }
  }
  if (at < 0) return [];

  const out = [];
  const last = Math.min(MAX_PHRASE_WORDS, words.length - at);
  for (let count = 1; count <= last; count += 1) {
    // A multi-word query is only half-covered by the first word or two of the
    // phrase, and "tai" is not a suggestion for someone who typed "tai nghe".
    // The query sits at the head of the phrase by construction, so "covers it"
    // is a prefix test.
    if (!folded.slice(at, at + count).join(' ').startsWith(foldedQuery)) continue;
    // The last word carries the meaning of the phrase, so it is the one that
    // has to be a real word. Filler in the middle ("váy dài cho nữ") is how
    // people actually search and is left alone.
    if (count > 1 && !usableWord(words[at + count - 1])) continue;
    out.push(words.slice(at, at + count).join(' '));
  }
  return out;
}

/**
 * The typeahead list. Returns display strings, most-searchable first.
 *
 * The user's own past searches that match come first and are never crowded
 * out by the catalogue: someone who searched "cám cá oranda" last week and
 * types "cám" is asking for that one back.
 */
async function suggestTerms(userId, query, limit = 10) {
  const q = String(query || '').trim();
  if (q.length < 1) return [];
  // Punctuation is folded away too, so "tai-nghe" and "tai nghe" ask the same
  // question - the catalogue is matched word by word and would never answer
  // the hyphenated form otherwise.
  const foldedQuery = splitWords(q).map(foldForSearch).join(' ');
  if (!foldedQuery) return [];

  const mine = [];
  if (userId) {
    const rows = await prisma.searchHistory.findMany({
      where: { userId: Number(userId) },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_SCAN,
      select: { term: true },
    });
    for (const row of rows) {
      if (mine.length >= limit) break;
      const key = foldForSearch(row.term);
      if (!key.includes(foldedQuery)) continue;
      if (mine.some((t) => foldForSearch(t) === key)) continue;
      mine.push(row.term);
    }
  }

  const names = await prisma.shoppingProduct.findMany({
    // Same matcher the product list uses (lib/repositories/shoppingProducts.js
    // #buildWhere), so every suggestion is one that returns results - both
    // sides now read the folded column, so offering an unaccented phrase no
    // longer means offering a search the grid answers empty.
    where: { nameFolded: { contains: foldedQuery } },
    select: { name: true },
    orderBy: { id: 'desc' },
    take: SAMPLE_ROWS,
  });

  const counts = new Map();
  for (const row of names) {
    // One product votes for a phrase once, however many times its title
    // repeats it.
    for (const phrase of new Set(phrasesFrom(row.name, foldedQuery))) {
      // Keyed on the fold, so "Điện Thoại" and "ĐIỆN THOẠI" are one
      // suggestion with two votes instead of two suggestions with one - which
      // is what MIN_PHRASE_FREQ is counting.
      const key = foldForSearch(phrase);
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { display: phrase, count: 1 });
    }
  }

  const ranked = [...counts.values()]
    .filter((entry) => entry.count >= MIN_PHRASE_FREQ || foldForSearch(entry.display) === foldedQuery)
    .sort((a, b) => b.count - a.count || a.display.length - b.display.length)
    .map((entry) => entry.display);

  const seen = new Set(mine.map((t) => foldForSearch(t)));
  const out = [...mine];
  for (const term of ranked) {
    if (out.length >= limit) break;
    const key = foldForSearch(term);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out.slice(0, limit);
}

let discoveryCache = { at: 0, rows: [] };

// The catalogue side of the keyword cards: the biggest real categories, each
// with a product image to stand for it. Shared by every user and refreshed on
// a timer, because counting 90k rows by category is not a per-request query.
async function discoveryPool() {
  if (Date.now() - discoveryCache.at < DISCOVERY_TTL_MS && discoveryCache.rows.length) {
    return discoveryCache.rows;
  }

  const grouped = await prisma.shoppingProduct.groupBy({
    by: ['category'],
    _count: { _all: true },
    where: { category: { not: null }, imageUrl: { not: null } },
  });
  // Shopee's taxonomy carries the same category under two capitalisations
  // ("Áo thun" and "Áo Thun"), which would otherwise show up as two cards
  // reading the same word. The bigger of the pair wins.
  const bestByKey = new Map();
  for (const row of grouped) {
    if (!row.category) continue;
    const key = foldForSearch(row.category);
    if (!key || key === 'khac') continue;
    const current = bestByKey.get(key);
    if (!current || row._count._all > current._count._all) bestByKey.set(key, row);
  }
  const names = [...bestByKey.values()]
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, DISCOVERY_POOL)
    .map((row) => row.category);

  if (!names.length) return [];

  // DISTINCT ON picks the newest imaged product per category in one pass -
  // forty separate findFirst calls would be forty round trips for a list that
  // barely changes.
  const images = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT ON (category) category, image_url AS "imageUrl"
       FROM shopping_products
      WHERE image_url IS NOT NULL AND category = ANY($1::text[])
      ORDER BY category, id DESC`,
    names
  );
  const byCategory = new Map(images.map((row) => [row.category, row.imageUrl]));

  discoveryCache = {
    at: Date.now(),
    rows: names
      .filter((name) => byCategory.has(name))
      .map((name) => ({ term: name, imageUrl: byCategory.get(name) })),
  };
  return discoveryCache.rows;
}

/**
 * The "Gợi ý tìm kiếm" grid. Same cards for everyone, ordered by what this
 * user has actually been creating links for - the cheap half of
 * personalisation, off one query instead of the full affinity build.
 */
async function discovery(userId, limit = 8) {
  const pool = await discoveryPool();
  if (!pool.length) return [];
  if (!userId) return pool.slice(0, limit);

  const links = await prisma.link.findMany({
    where: { userId: Number(userId), catName: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: AFFINITY_LINKS,
    select: { catName: true },
  });

  const rank = new Map();
  links.forEach((link, index) => {
    const key = foldForSearch(link.catName);
    // Newest link counts most, and a category linked twice outranks one
    // linked once - the same shape of weighting the feed uses.
    if (key) rank.set(key, (rank.get(key) || 0) + 1 / Math.sqrt(index + 1));
  });
  if (!rank.size) return pool.slice(0, limit);

  return [...pool]
    .sort((a, b) => (rank.get(foldForSearch(b.term)) || 0) - (rank.get(foldForSearch(a.term)) || 0))
    .slice(0, limit);
}

module.exports = { suggestTerms, discovery };
