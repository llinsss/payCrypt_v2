export const up = async (knex) => {
  const hasAdminNotes = await knex.schema.hasColumn("disputes", "admin_notes");
  const hasResolvedBy = await knex.schema.hasColumn("disputes", "resolved_by");
  const hasOutcome = await knex.schema.hasColumn("disputes", "outcome");

  await knex.schema.alterTable("disputes", (table) => {
    if (!hasAdminNotes) {
      table.text("admin_notes").nullable();
    }
    if (!hasResolvedBy) {
      table.integer("resolved_by").unsigned().nullable();
      table.foreign("resolved_by").references("id").inTable("users").onDelete("SET NULL");
    }
    if (!hasOutcome) {
      table.string("outcome", 20).nullable(); // upheld, rejected
    }
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable("disputes", (table) => {
    table.dropColumn("admin_notes");
    table.dropForeign("resolved_by");
    table.dropColumn("resolved_by");
    table.dropColumn("outcome");
  });
};
