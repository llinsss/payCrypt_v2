export async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('kyc', 'rejection_reason');
  if (!hasColumn) {
    await knex.schema.alterTable('kyc', (table) => {
      table.text('rejection_reason').nullable();
    });
  }
}

export async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('kyc', 'rejection_reason');
  if (hasColumn) {
    await knex.schema.alterTable('kyc', (table) => {
      table.dropColumn('rejection_reason');
    });
  }
}
