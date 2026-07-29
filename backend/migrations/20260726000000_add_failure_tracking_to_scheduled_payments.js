export const up = async (knex) => {
  const hasFailureCount = await knex.schema.hasColumn("scheduled_payments", "failure_count");
  const hasLastFailureAt = await knex.schema.hasColumn("scheduled_payments", "last_failure_at");

  await knex.schema.alterTable("scheduled_payments", (table) => {
    if (!hasFailureCount) {
      table.integer("failure_count").unsigned().notNullable().defaultTo(0);
    }
    if (!hasLastFailureAt) {
      table.timestamp("last_failure_at").nullable();
    }
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable("scheduled_payments", (table) => {
    table.dropColumn("failure_count");
    table.dropColumn("last_failure_at");
  });
};
