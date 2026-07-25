export async function up(knex) {
  const hasTable = await knex.schema.hasTable('device_tokens');
  if (!hasTable) {
    await knex.schema.createTable('device_tokens', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('token', 512).notNullable();
      table.enu('platform', ['android', 'ios']).notNullable();
      table.boolean('active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['user_id', 'token']);
      table.index('user_id');
      table.index('token');
    });
  }
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('device_tokens');
}
