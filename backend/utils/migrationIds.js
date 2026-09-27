/**
 * Migration identifier helpers.
 *
 * Knex runs migrations in filename order, so each file must start with a
 * unique numeric identifier, and sorting by filename must match sorting by
 * that identifier. When a migration is renamed to fix ordering, record it in
 * RENAMED_MIGRATIONS so databases that applied it under the old name are
 * updated in `knex_migrations` instead of failing Knex's "migration directory
 * is corrupt" check or re-running the migration.
 */

export const MIGRATION_FILENAME = /^(\d+)_[a-z0-9_]+\.js$/;

export const RENAMED_MIGRATIONS = Object.freeze({
  "20250324_add_chain_to_reconciliation_reports.js": "20250324000001_add_chain_to_reconciliation_reports.js",
  "20250324_add_search_vector_to_transactions.js": "20250324000002_add_search_vector_to_transactions.js",
  "20260220000000_create_scheduled_payments.js": "20260220000001_create_scheduled_payments.js",
});

/** Returns human-readable problems; empty when IDs are well-formed, unique and ordered. */
export function findMigrationIdProblems(files) {
  const problems = [];
  const seen = new Map();
  let previous = null;

  for (const file of files.filter((f) => f.endsWith(".js")).sort()) {
    const match = MIGRATION_FILENAME.exec(file);
    if (!match) {
      problems.push(`${file}: name must match <numeric id>_<snake_case>.js`);
      continue;
    }

    const id = BigInt(match[1]);
    if (seen.has(id)) {
      problems.push(`${file}: duplicate id ${match[1]} (also used by ${seen.get(id)})`);
    } else if (previous && id < previous.id) {
      problems.push(`${file}: id ${match[1]} sorts after ${previous.file} but is numerically smaller`);
    }

    seen.set(id, seen.get(id) ?? file);
    previous = { id, file };
  }

  return problems;
}

/** Rewrites renamed migrations in the Knex bookkeeping table. Safe to run repeatedly. */
export async function syncRenamedMigrations(knex, tableName = "knex_migrations") {
  if (!(await knex.schema.hasTable(tableName))) return 0;

  let updated = 0;
  for (const [oldName, newName] of Object.entries(RENAMED_MIGRATIONS)) {
    updated += await knex(tableName).where({ name: oldName }).update({ name: newName });
  }
  return updated;
}
