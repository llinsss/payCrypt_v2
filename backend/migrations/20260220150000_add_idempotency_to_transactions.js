export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn("transactions", "idempotency_key");
  if (!hasColumn) {
    await knex.schema.alterTable("transactions", (table) => {
      table.string("idempotency_key", 255).nullable().unique();
      table.index("idempotency_key");
    });
  }
}

export async function down(knex) {
  const hasColumn = await knex.schema.hasColumn("transactions", "idempotency_key");
  if (hasColumn) {
    await knex.schema.alterTable("transactions", (table) => {
      table.dropColumn("idempotency_key");
    });
  }
}
