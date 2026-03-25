/**
 * Migration: Add rate limit tiers to users and api_keys tables
 * - users.tier: FREE or PREMIUM (default: FREE)
 * - api_keys.rate_limit: custom per-key limit (nullable, uses tier default if null)
 */
export async function up(knex) {
  // Add tier column to users table
  await knex.schema.alterTable("users", (table) => {
    table
      .enum("tier", ["FREE", "PREMIUM"], {
        useNative: true,
        enumName: "user_tier",
      })
      .defaultTo("FREE")
      .notNullable();
  });

  // Add rate_limit column to api_keys table
  await knex.schema.alterTable("api_keys", (table) => {
    table.integer("rate_limit").unsigned().nullable();
  });
}

export async function down(knex) {
  await knex.schema.alterTable("api_keys", (table) => {
    table.dropColumn("rate_limit");
  });

  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("tier");
  });

  await knex.schema.raw("DROP TYPE IF EXISTS user_tier");
}
