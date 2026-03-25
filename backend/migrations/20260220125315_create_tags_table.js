export const up = async function (knex) {
  await knex.schema.createTable("tags", (table) => {
    table.increments("id").primary();
    table.string("name").notNullable();

    table.integer("user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");

    table.timestamp("created_at").defaultTo(knex.fn.now());

    // Prevent duplicate tag names per user
    table.unique(["name", "user_id"]);
  });
};

export const down = async function (knex) {
  await knex.schema.dropTableIfExists("tags");
};