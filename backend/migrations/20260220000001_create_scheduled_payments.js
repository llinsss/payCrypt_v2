export const up = async (knex) => {
  const exists = await knex.schema.hasTable("scheduled_payments");

  if (!exists) {
    return knex.schema.createTable("scheduled_payments", (table) => {
      table.increments("id").primary();
      table.integer("user_id").unsigned().notNullable();
      table.string("sender_tag", 20).notNullable();
      table.string("recipient_tag", 20).notNullable();
      table.decimal("amount", 18, 10).notNullable();
      table.string("asset", 12).defaultTo("XLM");
      table.string("asset_issuer", 56).nullable();
      table.string("memo", 28).nullable();
      table.timestamp("scheduled_at").notNullable();
      table
        .string("status", 20)
        .defaultTo("pending")
        .notNullable();
      table.integer("transaction_id").unsigned().nullable();
      table.text("failure_reason").nullable();
      table.timestamp("notified_at").nullable();
      table.timestamp("executed_at").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());

      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      table
        .foreign("transaction_id")
        .references("id")
        .inTable("transactions")
        .onDelete("SET NULL");

      table.index("user_id");
      table.index("status");
      table.index("scheduled_at");
      table.index(["status", "scheduled_at"]);
    });
  }
};

export const down = async (knex) => {
  return knex.schema.dropTableIfExists("scheduled_payments");
};
