const { Prisma } = require('@prisma/client');

// Shared SQL fragments for "when did this happen, in Vietnamese local time".
// Both the admin order list (date filters) and the reports screen (daily
// buckets) need the same answer, and the answer is not obvious:
//
//  1. orders.purchase_time is the Unix timestamp Shopee reports, stored in a
//     TEXT column ("1787855363"), occasionally in milliseconds, and empty on
//     rows imported before Shopee gave us one - those fall back to created_at.
//  2. created_at columns are `timestamp without time zone` holding UTC, so
//     they must be told they are UTC before being shifted to +07 - otherwise
//     an order placed at 06:00 Hanoi time lands on the previous day.
const TZ = 'Asia/Ho_Chi_Minh';

// Local (UTC+7) wall-clock timestamp of when an order was placed. Assumes the
// orders table is aliased `o`.
const ORDER_AT = Prisma.sql`
  (COALESCE(
    CASE WHEN o.purchase_time ~ '^[0-9]+$' THEN to_timestamp(
      CASE WHEN o.purchase_time::bigint > 1000000000000
        THEN o.purchase_time::bigint / 1000
        ELSE o.purchase_time::bigint END
    ) END,
    o.created_at AT TIME ZONE 'UTC'
  ) AT TIME ZONE ${TZ})
`;

// Same shift for a plain UTC timestamp column, e.g. localAt('u.created_at').
function localAt(column) {
  return Prisma.sql`((${Prisma.raw(column)} AT TIME ZONE 'UTC') AT TIME ZONE ${TZ})`;
}

// Inclusive day window. `from`/`to` are 'YYYY-MM-DD'; either may be null,
// which drops that end of the range rather than matching nothing.
function dayRange(expr, from, to) {
  const parts = [];
  if (from) parts.push(Prisma.sql`${expr}::date >= ${from}::date`);
  if (to) parts.push(Prisma.sql`${expr}::date <= ${to}::date`);
  if (!parts.length) return Prisma.sql`TRUE`;
  return Prisma.join(parts, ' AND ');
}

module.exports = { TZ, ORDER_AT, localAt, dayRange };
