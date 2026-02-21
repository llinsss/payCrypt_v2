export async function up(knex) {
  // Add rotation fields to api_keys table
  await knex.schema.alterTable("api_keys", (table) => {
    table.integer("rotation_interval_days").nullable();
    table.timestamp("next_rotation_at").nullable();
    table.timestamp("transition_ends_at").nullable();
    table.timestamp("last_rotated_at").nullable();
    
    table.index("next_rotation_at");
    table.index("transition_ends_at");
  });

  // Create api_key_audit_logs table
  await knex.schema.createTable("api_key_audit_logs", (table) => {
    table.increments("id").primary();
    table.integer("api_key_id").unsigned().notNullable();
    table.uuid("user_id").notNullable();
    table.string("action").notNullable();
    table.jsonb("metadata").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.foreign("api_key_id").references("id").inTable("api_keys").onDelete("CASCADE");
    table.foreign("user_id").references("id").inTable("users").onDelete("CASCADE");
    
    table.index("api_key_id");
    table.index("user_id");
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists("api_key_audit_logs");
  await knex.schema.alterTable("api_keys", (table) => {
    table.dropColumn("last_rotated_at");
    table.dropColumn("transition_ends_at");
    table.dropColumn("next_rotation_at");
    table.dropColumn("rotation_interval_days");
  });
}
