/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable('webhooks');
  
  if (!exists) {
    return knex.schema.createTable('webhooks', function (table) {
      table.increments('id').primary();
      table.integer('user_id').unsigned();
      table.string('url', 500).notNullable();
      table.string('secret', 255).notNullable(); // For HMAC signature verification
      table.jsonb('events').notNullable(); // Array of event types to listen for
      table.string('status', 20).defaultTo('active'); // active, inactive, failed
      table.integer('retry_count').defaultTo(0);
      table.integer('max_retries').defaultTo(3);
      table.timestamp('last_triggered_at');
      table.timestamp('last_success_at');
      table.timestamp('last_failure_at');
      table.text('last_error');
      table.jsonb('headers'); // Custom headers to send with webhook
      table.jsonb('metadata'); // Additional webhook configuration
      table.boolean('is_active').defaultTo(true);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      // Indexes for performance
      table.index('user_id');
      table.index('status');
      table.index('is_active');
      table.index(['user_id', 'is_active']);
      table.index('created_at');
      
      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    });
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  return knex.schema.dropTableIfExists('webhooks');
}
