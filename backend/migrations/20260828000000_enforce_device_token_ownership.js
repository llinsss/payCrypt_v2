export async function up(knex) {
  const hasTable = await knex.schema.hasTable("device_tokens");
  if (!hasTable) return;

  const rows = await knex("device_tokens")
    .select("id", "token", "updated_at")
    .orderBy("updated_at", "desc");
  const retained = new Set();
  const duplicateIds = [];
  for (const row of rows) {
    if (retained.has(row.token)) duplicateIds.push(row.id);
    else retained.add(row.token);
  }
  if (duplicateIds.length) {
    await knex("device_tokens").whereIn("id", duplicateIds).del();
  }

  await knex.schema.alterTable("device_tokens", (table) => {
    table.dropUnique(["user_id", "token"]);
    table.unique(["token"]);
  });
}

export async function down(knex) {
  await knex.schema.alterTable("device_tokens", (table) => {
    table.dropUnique(["token"]);
    table.unique(["user_id", "token"]);
  });
}