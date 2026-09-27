export async function up(knex) {
  return knex.schema.createTable("auth_sessions", (table) => {
    table.uuid("id").primary();
    table.integer("user_id").unsigned().notNullable();
    table.string("refresh_token_hash", 64).notNullable().unique();
    table.timestamp("expires_at").notNullable();
    table.timestamp("revoked_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("last_used_at").nullable();
    table.foreign("user_id").references("id").inTable("users").onDelete("CASCADE");
    table.index(["user_id", "revoked_at"]);
    table.index("expires_at");
  });
}

export async function down(knex) {
  return knex.schema.dropTableIfExists("auth_sessions");
}