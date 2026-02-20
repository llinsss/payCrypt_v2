export const up = function (knex) {
  return knex.schema.alterTable('transactions', function (table) {
    table.jsonb('metadata').nullable();
  });
};

export const down = function (knex) {
  return knex.schema.alterTable('transactions', function (table) {
    table.dropColumn('metadata');
  });
};