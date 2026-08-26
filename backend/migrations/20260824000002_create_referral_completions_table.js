export const up = async (knex) => {
  const exists = await knex.schema.hasTable("referral_completions");

  if (!exists) {
    return knex.schema.createTable("referral_completions", (table) => {
      table.increments("id").primary();
      table.integer("referrer_id").unsigned().notNullable();
      table.integer("referred_user_id").unsigned().notNullable();
      table.timestamp("completed_at").defaultTo(knex.fn.now());
      table.timestamp("created_at").defaultTo(knex.fn.now());

      table.foreign("referrer_id").references("id").inTable("users").onDelete("CASCADE");
      table.foreign("referred_user_id").references("id").inTable("users").onDelete("CASCADE");

      table.unique(["referred_user_id"]);
      table.index("referrer_id");
    });
  }
};

export const down = async (knex) => {
  return knex.schema.dropTableIfExists("referral_completions");
};
