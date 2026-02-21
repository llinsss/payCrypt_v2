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
        .notNullable(); // open, under_review, escalated, resolved, closed
      table
        .string("priority", 10)
        .defaultTo("medium")
        .notNullable(); // low, medium, high, critical
      table
        .string("category", 20)
        .notNullable(); // unauthorized, duplicate, wrong_amount, not_received, fraud, other
      table.text("resolution_note").nullable();
      table.integer("assigned_admin_id").unsigned().nullable();
      table.text("escalation_reason").nullable();
      table.timestamp("escalated_at").nullable();
      table.timestamp("resolved_at").nullable();
      table.timestamp("closed_at").nullable();
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
      table
        .foreign("assigned_admin_id")
        .references("id")
        .inTable("users")
        .onDelete("SET NULL");

      table.index("transaction_id");
      table.index("user_id");
      table.index("status");
      table.index("priority");
      table.index("category");
      table.index("assigned_admin_id");
    });
  }

  // Create dispute_comments table for discussion history
  const commentsExist = await knex.schema.hasTable("dispute_comments");

  if (!commentsExist) {
    return knex.schema.createTable("dispute_comments", (table) => {
      table.increments("id").primary();
      table.integer("dispute_id").unsigned().notNullable();
      table.integer("user_id").unsigned().notNullable();
      table.text("comment").notNullable();
      table.boolean("is_admin").defaultTo(false);
      table.timestamp("created_at").defaultTo(knex.fn.now());

      table
        .foreign("dispute_id")
        .references("id")
        .inTable("disputes")
        .onDelete("CASCADE");
      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");

      table.index("dispute_id");
    });
  }
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists("dispute_comments");
  return knex.schema.dropTableIfExists("disputes");
};
