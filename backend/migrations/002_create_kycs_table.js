export const up = async (knex) => {
  return knex.schema.createTable("kyc", (table) => {
    table.increments("id").primary();
    table.integer("user_id").unsigned().notNullable();
    table.string("type", 255);
    table.string("number", 255);
    table.string("status", 255).defaultTo('pending');
    table.string("front_image", 255);
    table.string("back_image", 255);
    table.text("content");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table
      .foreign("user_id")
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.index("user_id");
  });
};

export const down = async (knex) => {
  return knex.schema.dropTable("kyc");
};
