export const up = async (knex) => {
  const hasTable = await knex.schema.hasTable("transactions");
  if (!hasTable) return;

  const exists = await knex.raw(
    "SELECT column_name FROM information_schema.columns WHERE table_name='transactions' AND column_name='type'"
  );

  if (!exists.rows || exists.rows.length === 0) {
    return;
  }

  const typeColumn = await knex("transactions")
    .whereNull("type")
    .orWhere("type", "like", "%approval%")
    .first();

  if (!typeColumn) {
    console.log("✓ Transactions table supports approval type already");
  }
};

export const down = async (knex) => {
};
