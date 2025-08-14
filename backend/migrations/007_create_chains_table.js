export const up = async (knex) => {
  return knex.schema.createTable("chains", (table) => {
    table.increments("id").primary();
    table.string("name", 255);
    table.string("symbol", 255);
    table.string("rpc_url", 255);
    table.string("block_explorer", 255);
    table.text("native_currency");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

export const down = async (knex) => {
  return knex.schema.dropTable("chains");
};
