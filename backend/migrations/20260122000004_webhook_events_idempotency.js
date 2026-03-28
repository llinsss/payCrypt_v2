/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
  const hasCol = await knex.schema.hasColumn("webhook_events", "idempotency_key");
  if (!hasCol) {
    await knex.schema.alterTable("webhook_events", (table) => {
      table.string("idempotency_key", 64).nullable();
      table.unique(["webhook_id", "idempotency_key"], "uq_webhook_events_idempotency");
    });
  }
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
  await knex.schema.alterTable("webhook_events", (table) => {
    table.dropUnique(["webhook_id", "idempotency_key"], "uq_webhook_events_idempotency");
    table.dropColumn("idempotency_key");
  });
}
