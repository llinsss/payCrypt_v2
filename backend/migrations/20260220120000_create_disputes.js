export const up = async (knex) => {
  const exists = await knex.schema.hasTable("disputes");

  if (!exists) {
    return knex.schema.createTable("disputes", (table) => {
      table.increments("id").primary();
      table.integer("transaction_id").unsigned().notNullable();
      table.integer("user_id").unsigned().notNullable();
      table.string("reason", 255).notNullable();
      table.text("description").notNullable();
      table.string("evidence_url").nullable();
      table
        .string("status", 20)
        .defaultTo("open")
        .notNullable(); // open, under_review, resolved, closed
      table.text("resolution_note").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());

      table
        .foreign("transaction_id")
        .references("id")
        .inTable("transactions")
        .onDelete("CASCADE");
      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      table.index("transaction_id");
      table.index("user_id");
      table.index("status");
    });
  }
};

export const down = async (knex) => {
  return knex.schema.dropTableIfExists("disputes");
};
