export const up = async (knex) => {
  await knex.schema.createTable("notification_preferences", (table) => {
    table.increments("id").primary();
    table.integer("user_id").unsigned().notNullable();
    table.boolean("email_enabled").defaultTo(true);
    table.boolean("sms_enabled").defaultTo(false);
    table.boolean("push_enabled").defaultTo(true);
    table.boolean("transaction_notifications").defaultTo(true);
    table.boolean("payment_notifications").defaultTo(true);
    table.boolean("security_notifications").defaultTo(true);
    table.boolean("marketing_notifications").defaultTo(false);
    table.timestamps(true, true);

    table.foreign("user_id").references("users.id").onDelete("CASCADE");
    table.unique("user_id");
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists("notification_preferences");
};
