export async function up(knex) {
  await knex.schema.createTable('stellar_stream_cursors', (table) => {
    table.increments('id').primary();
    table.string('stellar_address', 56).notNullable().unique();
    table.string('cursor', 128).notNullable();
    table.string('last_tx_hash', 64);
    table.timestamp('last_processed_at');
    table.integer('processed_count').defaultTo(0);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.index('stellar_address');
    table.index('last_processed_at');
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('stellar_stream_cursors');
}