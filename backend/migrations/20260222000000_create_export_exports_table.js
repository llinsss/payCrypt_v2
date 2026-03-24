export const up = async (knex) => {
  const exists = await knex.schema.hasTable("export_exports");

  if (!exists) {
    return knex.schema.createTable("export_exports", (table) => {
      table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
      table.integer("user_id").unsigned().notNullable();
      table.string("file_path", 500).notNullable();
      table.string("format", 10).notNullable();
      table.jsonb("filters").defaultTo("{}");
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("expires_at").notNullable();
      table.foreign("user_id").references("id").inTable("users").onDelete("CASCADE");
      table.index("user_id");
      table.index("expires_at");
    });
  }
};

export const down = async (knex) => {
  return knex.schema.dropTableIfExists("export_exports");
};
