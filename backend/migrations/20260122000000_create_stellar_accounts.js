/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable('stellar_accounts');
  
  if (!exists) {
    return knex.schema.createTable('stellar_accounts', function (table) {
      table.increments('id').primary();
      table.string('stellar_address', 56).unique().notNullable();
      table.string('public_key', 56).notNullable();
      table.integer('user_id').unsigned();
      table.string('account_type', 50).defaultTo('standard'); // standard, multisig, etc.
      table.decimal('xlm_balance', 20, 7).defaultTo(0);
      table.integer('sequence_number').unsigned();
      table.jsonb('signers').defaultTo('[]');
      table.jsonb('balances').defaultTo('[]'); // Store all asset balances
      table.jsonb('thresholds'); // low, medium, high thresholds
      table.jsonb('flags'); // account flags
      table.string('home_domain', 255);
      table.integer('subentry_count').unsigned().defaultTo(0);
      table.boolean('is_active').defaultTo(true);
      table.timestamp('last_synced_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      // Indexes for performance
      table.index('stellar_address');
      table.index('user_id');
      table.index('account_type');
      table.index('is_active');
      table.index('created_at');
      
      // Foreign key
      table.foreign('user_id').references('id').inTable('users').onDelete('SET NULL');
    });
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  return knex.schema.dropTableIfExists('stellar_accounts');
}
