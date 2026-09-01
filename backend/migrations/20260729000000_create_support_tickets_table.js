export const up = async (knex) => {
  const exists = await knex.schema.hasTable("support_tickets");

  if (!exists) {
    await knex.schema.createTable("support_tickets", (table) => {
      table.increments("id").primary();
      table.integer("user_id").unsigned().notNullable();
      table.string("subject", 255).notNullable();
      table.text("description").notNullable();
      table
        .string("issue_type", 30)
        .notNullable()
        .defaultTo("other");
      // failed_transaction | kyc_verification | deposit_issue |
      // withdrawal_issue   | account_access   | other
      table
        .string("status", 20)
        .notNullable()
        .defaultTo("open");
      // open | in_progress | resolved | closed
      table
        .string("priority", 10)
        .notNullable()
        .defaultTo("medium");
      // low | medium | high
      table.string("transaction_id", 100).nullable();
      table.timestamp("resolved_at").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());

      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      table.index("user_id");
      table.index("status");
      table.index("priority");
      table.index("issue_type");
    });
  }
};

export const down = async (knex) => {
  return knex.schema.dropTableIfExists("support_tickets");
};
