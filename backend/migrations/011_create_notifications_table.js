export const up = async (knex) => {
  const exists = await knex.schema.hasTable("notifications");

  if (!exists) {
    return knex.schema.createTable("notifications", (table) => {
      table.increments("id").primary();
      table.integer("user_id").unsigned().notNullable();
      table.string("title", 255);
      table.string("body", 255);
      table.boolean("read").defaultTo(false);
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());

      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      table.index("user_id");
    });
  }
};

export const down = async (knex) => {
  return knex.schema.dropTableIfExists("notifications");
};
