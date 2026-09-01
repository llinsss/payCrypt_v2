/**
 * Creates `refresh_tokens` table for secure JWT refresh token rotation.
 * Each token is stored hashed (bcrypt), with a `usedAt` timestamp for replay detection.
 * Tokens are single-use: once redeemed, they can no longer mint a new pair.
 * Tokens can be revoked en masse if replay is detected (full session revocation).
 */
export const up = async function (knex) {
  const hasTable = await knex.schema.hasTable("refresh_tokens");
  if (!hasTable) {
    await knex.schema.createTable("refresh_tokens", (table) => {
      table.increments("id").primary();
      table.string("user_id", 36).notNullable().index();
      table.text("token_hash").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now()).index();
      table.timestamp("expires_at").notNullable().index();
      table.timestamp("used_at").nullable();
      table.string("ip_address", 45).nullable();
      table.string("user_agent", 500).nullable();

      table.foreign("user_id").references("id").inTable("users").onDelete("CASCADE");
      table.index(["user_id", "expires_at"]);
    });
  }
};

export const down = async function (knex) {
  const hasTable = await knex.schema.hasTable("refresh_tokens");
  if (hasTable) {
    await knex.schema.dropTable("refresh_tokens");
  }
};
