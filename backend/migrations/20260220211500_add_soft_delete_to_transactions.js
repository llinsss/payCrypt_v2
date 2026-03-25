
export const up = function (knex) {
  return knex.schema.table("transactions", function (table) {
    table.timestamp("deleted_at").nullable();
    table.index("deleted_at");
  });
};

export const down = function (knex) {
  return knex.schema.table("transactions", function (table) {
    table.dropColumn("deleted_at");
  });
};
