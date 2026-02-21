export async function up(knex) {
  return knex.schema.createTable("api_keys", (table) => {
    table.increments("id").primary();
    table.integer("user_id").unsigned().notNullable();
    table.string("key", 255).notNullable().unique().index();
    table.string("name", 255).notNullable(); // Friendly name for the API key
    table.string("scopes", 500); // Comma-separated scopes: read,write,payments
    table.string("ip_whitelist", 1000); // Comma-separated IP addresses
    table.boolean("is_active").defaultTo(true);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("last_used_at").nullable();
    table.timestamp("expires_at").nullable();
    table.timestamp("deleted_at").nullable();

    // Foreign key
    table.foreign("user_id").references("id").inTable("users").onDelete("CASCADE");

    // Indexes for performance
    table.index(["user_id", "is_active"]);
    table.index("expires_at");
  });
}

export async function down(knex) {
  return knex.schema.dropTableIfExists("api_keys");
}
