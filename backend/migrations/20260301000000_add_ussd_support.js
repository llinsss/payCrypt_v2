exports.up = async function(knex) {
  await knex.schema.table('users', (table) => {
    table.string('phone', 20).unique();
    table.index('phone');
  });

  await knex.schema.table('transactions', (table) => {
    table.string('channel', 20).defaultTo('web');
    table.index('channel');
  });
};

exports.down = async function(knex) {
  await knex.schema.table('users', (table) => {
    table.dropColumn('phone');
  });

  await knex.schema.table('transactions', (table) => {
    table.dropColumn('channel');
  });
};
