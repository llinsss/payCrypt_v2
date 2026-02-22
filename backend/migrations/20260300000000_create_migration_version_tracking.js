/**
 * Migration version tracking table.
 * Knex already uses the `knex_migrations` table internally, but this provides
 * a human-readable audit log of when migrations were applied and rolled back,
 * along with the author and environment — useful for ops and debugging.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable("migration_audit_log");

  if (!exists) {
    return knex.schema.createTable("migration_audit_log", (table) => {
      table.increments("id").primary();
      table.string("migration_name", 255).notNullable();
      table.string("direction", 10).notNullable(); // 'up' or 'down'
      table.string("environment", 50).defaultTo(process.env.NODE_ENV ?? "development");
      table.string("applied_by", 255).nullable(); // process user or CI identity
      table.boolean("success").defaultTo(true);
      table.text("error_message").nullable();
      table.integer("duration_ms").nullable();
      table.timestamp("applied_at").defaultTo(knex.fn.now());

      table.index("migration_name");
      table.index("direction");
      table.index("applied_at");
    });
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  return knex.schema.dropTableIfExists("migration_audit_log");
}
