/**
 * Migration: create reconciliation_reports table (backfill)
 *
 * This table was referenced in ReconciliationService.js and
 * EvmReconciliationService.js but had no CREATE migration.  Only an ALTER
 * migration (20250324_add_chain_to_reconciliation_reports) existed.
 *
 * Columns derived from all INSERT and SELECT statements in:
 *   - services/ReconciliationService.js
 *   - services/EvmReconciliationService.js
 */

export async function up(knex) {
  const exists = await knex.schema.hasTable("reconciliation_reports");
  if (exists) return;

  await knex.schema.createTable("reconciliation_reports", (table) => {
    table.increments("id").primary();
    table.timestamp("started_at").notNullable();
    table.timestamp("finished_at").nullable();
    table.integer("duration_ms").nullable();
    table.integer("total_accounts").defaultTo(0);
    table.integer("ok_count").defaultTo(0);
    table.integer("corrected_count").defaultTo(0);
    table.integer("major_discrepancy_count").defaultTo(0);
    table.integer("skipped_count").defaultTo(0);
    table.integer("error_count").defaultTo(0);
    table.jsonb("app_balance_corrections").nullable();
    table.text("details").nullable();
    table.text("error_details").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("reconciliation_reports");
}
