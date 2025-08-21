export const up = (knex) => {
  return knex.schema.table("balances", (table) => {
    table.string("auto_convert_threshold", 255).nullable();
  });
};

export const down = (knex) => {
  return knex.schema.table("balances", (table) => {
    table.dropColumn("auto_convert_threshold");
  });
};
