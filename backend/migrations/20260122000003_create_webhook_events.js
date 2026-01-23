/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable('webhook_events');
  
  if (!exists) {
    return knex.schema.createTable('webhook_events', function (table) {
      table.increments('id').primary();
      table.integer('webhook_id').unsigned().notNullable();
      table.string('event_type', 50).notNullable();
      table.jsonb('payload').notNullable();
      table.string('status', 20).defaultTo('pending'); // pending, success, failed
      table.integer('http_status_code').unsigned();
      table.text('response_body');
      table.text('error_message');
      table.integer('attempt_count').defaultTo(0);
      table.timestamp('next_retry_at');
      table.timestamp('delivered_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      // Indexes for performance
      table.index('webhook_id');
      table.index('event_type');
      table.index('status');
      table.index('created_at');
      table.index(['webhook_id', 'status']);
      table.index(['status', 'next_retry_at']);
      
      // Foreign key
      table.foreign('webhook_id').references('id').inTable('webhooks').onDelete('CASCADE');
    });
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  return knex.schema.dropTableIfExists('webhook_events');
}
