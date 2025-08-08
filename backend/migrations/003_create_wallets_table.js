export const up = async (knex) => {
  return knex.schema.createTable("wallets", (table) => {
    table.increments("id").primary();
    table.integer("user_id").unsigned().notNullable();
    table.string("name", 255);
    table.decimal("balance", 18, 12).defaultTo(0);
    table.string("address", 255);
    table.string("tag", 255);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table
      .foreign("user_id")
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.index("user_id");
  });
};

export const down = async (knex) => {
  return knex.schema.dropTable("wallets");
};
