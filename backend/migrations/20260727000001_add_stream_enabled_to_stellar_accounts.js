export async function up(knex) {
  await knex.schema.table('stellar_accounts', (table) => {
    table.boolean('stream_enabled').defaultTo(true);
    table.timestamp('stream_subscribed_at');
  });

  await knex('stellar_accounts').update({
    stream_enabled: knex.ref('is_active'),
    stream_subscribed_at: knex.raw('CASE WHEN is_active = true THEN NOW() ELSE NULL END'),
  });

  await knex.schema.table('stellar_accounts', (table) => {
    table.index('stream_enabled');
  });
}

export async function down(knex) {
  await knex.schema.table('stellar_accounts', (table) => {
    table.dropIndex('stream_enabled');
    table.dropColumn('stream_enabled');
    table.dropColumn('stream_subscribed_at');
  });
}