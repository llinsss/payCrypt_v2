/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable('stellar_transactions');
  
  if (!exists) {
    return knex.schema.createTable('stellar_transactions', function (table) {
      table.increments('id').primary();
      table.string('transaction_hash', 64).unique().notNullable();
      table.string('stellar_address', 56).notNullable();
      table.string('source_account', 56).notNullable();
      table.string('destination_account', 56);
      table.string('transaction_type', 50).notNullable(); // payment, create_account, path_payment, etc.
      table.string('asset_code', 12).defaultTo('XLM');
      table.string('asset_issuer', 56);
      table.decimal('amount', 20, 7).notNullable();
      table.decimal('fee', 20, 7).notNullable();
      table.string('memo_type', 20);
      table.text('memo');
      table.string('status', 20).defaultTo('pending'); // pending, success, failed
      table.integer('ledger_number').unsigned();
      table.timestamp('ledger_close_time');
      table.jsonb('operation_details'); // Store full operation data
      table.jsonb('metadata'); // Additional transaction metadata
      table.boolean('is_incoming').defaultTo(false);
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      // Indexes for performance
      table.index('transaction_hash');
      table.index('stellar_address');
      table.index('source_account');
      table.index('destination_account');
      table.index('transaction_type');
      table.index('status');
      table.index('ledger_number');
      table.index('created_at');
      table.index(['stellar_address', 'created_at']);
      table.index(['status', 'created_at']);
      
      // Foreign key
      table.foreign('stellar_address').references('stellar_address').inTable('stellar_accounts').onDelete('CASCADE');
    });
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  return knex.schema.dropTableIfExists('stellar_transactions');
}
