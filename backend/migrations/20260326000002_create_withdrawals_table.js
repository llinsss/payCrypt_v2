/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasTable = await knex.schema.hasTable('withdrawals');
  if (!hasTable) {
    await knex.schema.createTable('withdrawals', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('token_id').unsigned().notNullable().references('id').inTable('tokens');
      table.integer('bank_account_id').unsigned().notNullable().references('id').inTable('bank_accounts');
      
      table.decimal('amount_crypto', 20, 7).notNullable();
      table.decimal('amount_fiat', 20, 2).notNullable();
      table.string('currency', 3).defaultTo('NGN');
      
      table.decimal('fee', 20, 2).notNullable();
      table.decimal('exchange_rate', 20, 4).notNullable();
      
      table.string('provider', 20).notNullable(); // 'paystack' or 'monnify'
      table.string('provider_reference').unique().nullable();
      table.string('transfer_code').nullable(); // For Paystack
      
      table.enum('status', ['pending', 'processing', 'completed', 'failed', 'reversed']).defaultTo('pending');
      
      table.text('status_message').nullable();
      table.jsonb('metadata').nullable();
      
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      
      // Indexes
      table.index('user_id');
      table.index('status');
      table.index('provider_reference');
    });
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists('withdrawals');
}
