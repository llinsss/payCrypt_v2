export const up = async (knex) => {
  return knex.schema.createTable("transactions", (table) => {
    table.increments("id").primary();
    table.integer("user_id").unsigned().notNullable();
    table.integer("wallet_id").unsigned().notNullable();
    table.string("reference", 255);
    table.string("type", 255);
    table.string("action", 255);
    table.decimal("amount", 18, 12).defaultTo(0);
    table.decimal("balance_before", 18, 12).defaultTo(0);
    table.decimal("balance_after", 18, 12).defaultTo(0);
    table.string("status", 255).defaultTo("successful");
    table.string("hash", 255);
    table.string("token", 255);
    table.string("rate", 255);
    table.text("description");
    table.text("extra");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table
      .foreign("wallet_id")
      .references("id")
      .inTable("wallets")
      .onDelete("CASCADE");
    table.index("wallet_id");
    table
      .foreign("user_id")
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.index("user_id");
  });
};

export const down = async (knex) => {
  return knex.schema.dropTable("transactions");
};
