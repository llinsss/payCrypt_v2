export const up = async (knex) => {
  // Add search_vector column if it doesn't exist
  const hasColumn = await knex.schema.hasColumn(
    "transactions",
    "search_vector",
  );
  if (!hasColumn) {
    await knex.schema.alterTable("transactions", (table) => {
      table.specificType("search_vector", "tsvector").nullable();
    });
  }

  // GIN index for fast full-text search
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_transactions_search_vector
    ON transactions USING GIN (search_vector)
  `);

  // Composite cursor index for keyset pagination
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_transactions_cursor
    ON transactions (created_at DESC, id DESC)
    WHERE deleted_at IS NULL
  `);

  // Backfill search_vector for all existing rows
  await knex.raw(`
    UPDATE transactions
    SET search_vector = (
      setweight(to_tsvector('simple', COALESCE(description, '')), 'A') ||
      setweight(to_tsvector('simple', COALESCE(notes, '')), 'B') ||
      setweight(to_tsvector('simple', COALESCE(from_address, '')), 'C') ||
      setweight(to_tsvector('simple', COALESCE(to_address, '')), 'C') ||
      setweight(to_tsvector('simple', COALESCE(tx_hash, '')), 'D') ||
      setweight(to_tsvector('simple', COALESCE(reference, '')), 'D')
    )
    WHERE search_vector IS NULL
  `);

  // Trigger function: auto-update search_vector on insert/update
  await knex.raw(`
    CREATE OR REPLACE FUNCTION transactions_search_vector_update()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('simple', COALESCE(NEW.description, '')), 'A') ||
        setweight(to_tsvector('simple', COALESCE(NEW.notes, '')), 'B') ||
        setweight(to_tsvector('simple', COALESCE(NEW.from_address, '')), 'C') ||
        setweight(to_tsvector('simple', COALESCE(NEW.to_address, '')), 'C') ||
        setweight(to_tsvector('simple', COALESCE(NEW.tx_hash, '')), 'D') ||
        setweight(to_tsvector('simple', COALESCE(NEW.reference, '')), 'D');
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await knex.raw(`
    DROP TRIGGER IF EXISTS trg_transactions_search_vector ON transactions;
    CREATE TRIGGER trg_transactions_search_vector
    BEFORE INSERT OR UPDATE OF description, notes, from_address, to_address, tx_hash, reference
    ON transactions
    FOR EACH ROW EXECUTE FUNCTION transactions_search_vector_update()
  `);
};

export const down = async (knex) => {
  await knex.raw(
    `DROP TRIGGER IF EXISTS trg_transactions_search_vector ON transactions`,
  );
  await knex.raw(`DROP FUNCTION IF EXISTS transactions_search_vector_update`);
  await knex.raw(`DROP INDEX IF EXISTS idx_transactions_cursor`);
  await knex.raw(`DROP INDEX IF EXISTS idx_transactions_search_vector`);

  const hasColumn = await knex.schema.hasColumn(
    "transactions",
    "search_vector",
  );
  if (hasColumn) {
    await knex.schema.alterTable("transactions", (table) => {
      table.dropColumn("search_vector");
    });
  }
};
