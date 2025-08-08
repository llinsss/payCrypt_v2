export const up = async (knex) => {
  return knex.schema.createTable("users", (table) => {
    table.increments("id").primary();
    table.string("tag", 100).unique().notNullable();
    table.string("email", 100).unique().notNullable();
    table.string("password", 255).notNullable();
    table.string("address", 255).notNullable();
    table.string("photo", 255);
    table.string("kyc_status", 255).defaultTo("not_started");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.index("tag");
  });
};

export const down = async (knex) => {
  return knex.schema.dropTable("users");
};
