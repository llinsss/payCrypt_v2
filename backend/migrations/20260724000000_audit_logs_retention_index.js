export async function up(knex) {
  const hasIndex = await knex.schema.hasIndex("audit_logs", "idx_audit_logs_created_at");
  if (!hasIndex) {
    await knex.schema.alterTable("audit_logs", (table) => {
      table.index(["created_at"], "idx_audit_logs_created_at");
    });
  }
}

export async function down(knex) {
  await knex.schema.alterTable("audit_logs", (table) => {
    table.dropIndex([], "idx_audit_logs_created_at");
  });
}
