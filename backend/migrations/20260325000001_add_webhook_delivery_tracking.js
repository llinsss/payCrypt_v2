/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const exists = await knex.schema.hasTable('webhook_events');
  if (exists) {
    return knex.schema.alterTable('webhook_events', function (table) {
      // Add a JSON array to store the full historical log of multiple attempts
      // e.g., [{ attempt: 1, error: "timeout", at: "..." }, ...]
      table.jsonb('delivery_history').defaultTo('[]');
      // Add index to quickly find dead letters: status = 'dead_letter'
      // (The table already has an index on status, so this isn't strictly necessary, but good).
    });
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  const exists = await knex.schema.hasTable('webhook_events');
  if (exists) {
    return knex.schema.alterTable('webhook_events', function (table) {
      table.dropColumn('delivery_history');
    });
  }
}
