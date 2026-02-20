exports.up = function (knex) {
  return knex.schema.alterTable('transactions', function (table) {
    table.jsonb('metadata').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('transactions', function (table) {
    table.dropColumn('metadata');
  });
};