export const up = async (knex) => {
  const exists = await knex.schema.hasTable("balances");

  if (!exists) {
    return knex.schema.createTable("balances", (table) => {
      table.increments("id").primary();
      table.integer("user_id").unsigned().notNullable();
      table.integer("token_id").unsigned().notNullable();
      table.decimal("amount", 18, 10).defaultTo(0);
      table.decimal("usd_value", 18, 10).defaultTo(0);
      table.string("address", 255);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());

      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      table.index("user_id");
    });
  }
};

export const down = async (knex) => {
  return knex.schema.dropTableIfExists("balances");
};
