export async function up(knex) {
  return knex.schema.createTable("audit_logs", (table) => {
    table.increments("id").primary();
    table.integer("user_id").unsigned().nullable();
    table.string("action", 50).notNullable();
    table.string("resource", 100).notNullable();
    table.string("resource_id", 255).nullable();
    table.jsonb("details").nullable();
    table.string("ip_address", 45).nullable();
    table.string("user_agent", 500).nullable();
    table.string("method", 10).notNullable();
    table.string("endpoint", 500).notNullable();
    table.integer("status_code").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.foreign("user_id").references("id").inTable("users").onDelete("SET NULL");

    table.index("user_id");
    table.index("action");
    table.index("resource");
    table.index("created_at");
    table.index(["resource", "action"]);
  });
}

export async function down(knex) {
  return knex.schema.dropTableIfExists("audit_logs");
}
