export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('transactions', 'fingerprint');
  if (!hasColumn) {
    await knex.schema.alterTable('transactions', (table) => {
      table.string('fingerprint', 64).nullable();
      table.index('fingerprint');
    });
  }

  // Partial unique index: only one pending/completed row per fingerprint within
  // the duplicate-detection window is enforced at the DB level.
  // This prevents concurrent inserts from both succeeding past the race window.
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_txn_fingerprint_active
    ON transactions (fingerprint)
    WHERE fingerprint IS NOT NULL
      AND status IN ('pending', 'completed')
      AND deleted_at IS NULL
  `);
}

export async function down(knex) {
  await knex.raw(`DROP INDEX IF EXISTS uniq_txn_fingerprint_active`);
  const hasColumn = await knex.schema.hasColumn('transactions', 'fingerprint');
  if (hasColumn) {
    await knex.schema.alterTable('transactions', (table) => {
      table.dropColumn('fingerprint');
    });
  }
}
