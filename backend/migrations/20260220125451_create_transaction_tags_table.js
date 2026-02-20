export const up = async function (knex) {
  await knex.schema.createTable("transaction_tags", (table) => {
    table.increments("id").primary();

    table.integer("transaction_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("transactions")
      .onDelete("CASCADE");

    table.integer("tag_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("tags")
      .onDelete("CASCADE");

    // Prevent duplicate tag assignment
    table.unique(["transaction_id", "tag_id"]);
  });
};

export const down = async function (knex) {
  await knex.schema.dropTableIfExists("transaction_tags");
};
