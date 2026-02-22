export const up = async (knex) => {
  // Add search_vector column
  await knex.schema.alterTable("transactions", (table) => {
    table.specificType("search_vector", "tsvector");
  });

  // Create function and trigger for search_vector
  await knex.raw(`
    CREATE OR REPLACE FUNCTION transactions_search_vector_update() RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('simple', coalesce(NEW.reference, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(NEW.notes, '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(NEW.from_address, '')), 'D') ||
        setweight(to_tsvector('simple', coalesce(NEW.to_address, '')), 'D');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE TRIGGER transactions_search_vector_update_trigger
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW EXECUTE PROCEDURE transactions_search_vector_update();
  `);

  // Update existing data so the trigger fires and populates search_vector
  await knex.raw(`
    UPDATE transactions SET updated_at = updated_at;
  `);

  // Add GIN indexx
  await knex.raw(`
    CREATE INDEX transactions_search_vector_idx ON transactions USING GIN(search_vector);
  `);
};

export const down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS transactions_search_vector_idx');
  await knex.raw('DROP TRIGGER IF EXISTS transactions_search_vector_update_trigger ON transactions');
  await knex.raw('DROP FUNCTION IF EXISTS transactions_search_vector_update()');

  await knex.schema.alterTable("transactions", (table) => {
    table.dropColumn("search_vector");
  });
};
