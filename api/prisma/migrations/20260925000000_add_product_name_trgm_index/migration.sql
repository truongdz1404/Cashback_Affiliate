-- The recommendation pool looks products up by word: one `name ILIKE '%word%'`
-- per strong signal in the user's history (lib/repositories/recommendations.js,
-- candidatePool). A btree cannot answer a leading-wildcard match, so every one
-- of those was a sequential scan of the whole table - measured on production:
--
--   Seq Scan on shopping_products (actual time=3.127..647.677 rows=893)
--     Filter: (name ~~* '%Son%')
--     Rows Removed by Filter: 80256
--   Execution Time: 649.130 ms
--
-- Eight of those on a 2-core box is most of the 5.2s a cold feed took to
-- build. pg_trgm indexes the three-character sequences of the column, which is
-- exactly what a substring match needs.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN rather than GiST: this column is read constantly and written only by the
-- crawler in batches, which is the trade GIN makes (smaller and faster to
-- search, slower to update).
--
-- Deliberately NOT created CONCURRENTLY: prisma migrate runs each migration
-- inside a transaction, and CREATE INDEX CONCURRENTLY cannot run in one. The
-- table is ~81k rows, so the build takes seconds, and it happens during the
-- container's start-up migration step (api/scripts/start-xvfb.sh) before the
-- API serves anything.
CREATE INDEX "shopping_products_name_trgm_idx"
  ON "shopping_products" USING GIN ("name" gin_trgm_ops);
