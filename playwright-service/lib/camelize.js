// better-sqlite3 returns column names verbatim (snake_case, since that's how
// the schema is written). Aggregation queries alias every column by hand, but
// plain `SELECT *` rows need converting so the admin API always hands the
// frontend consistent camelCase field names.
function toCamelKey(key) {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function toCamel(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[toCamelKey(key)] = value;
  }
  return out;
}

function toCamelList(rows) {
  return rows.map(toCamel);
}

module.exports = { toCamel, toCamelList };
