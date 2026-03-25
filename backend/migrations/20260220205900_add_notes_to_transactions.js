export const up = function (knex) {
  return knex.schema.alterTable('transactions', function (table) {
    table.string('notes', 1000).nullable();
  });
};

export const down = function (knex) {
  return knex.schema.alterTable('transactions', function (table) {
    table.dropColumn('notes');
  });
};
