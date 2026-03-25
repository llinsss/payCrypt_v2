export const up = async function (knex) {
  const batchTableExists = await knex.schema.hasTable("payment_batches");

  if (!batchTableExists) {
    await knex.schema.createTable("payment_batches", (table) => {
      table.increments("id").primary();
      table.integer("user_id").unsigned().notNullable();
      table.string("reference", 255).notNullable().unique();
      table.string("sender_tag", 255).notNullable();
      table.string("asset", 12).notNullable().defaultTo("XLM");
      table.string("asset_issuer", 255).nullable();
      table.string("memo", 28).nullable();
      table.boolean("atomic").notNullable().defaultTo(true);
      table.string("status", 50).notNullable().defaultTo("pending");
      table.integer("total_items").notNullable().defaultTo(0);
      table.integer("processed_items").notNullable().defaultTo(0);
      table.integer("successful_items").notNullable().defaultTo(0);
      table.integer("failed_items").notNullable().defaultTo(0);
      table.decimal("total_amount", 18, 10).notNullable().defaultTo(0);
      table.string("tx_hash", 255).nullable();
      table.string("ledger", 255).nullable();
      table.text("failure_reason").nullable();
      table.jsonb("results").nullable();
      table.timestamp("completed_at").nullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());
      table.timestamp("updated_at").defaultTo(knex.fn.now());

      table.foreign("user_id").references("id").inTable("users").onDelete("CASCADE");
      table.index("user_id");
      table.index("status");
    });
  }

  const hasBatchId = await knex.schema.hasColumn("transactions", "batch_id");
  const hasBatchItemIndex = await knex.schema.hasColumn("transactions", "batch_item_index");

  await knex.schema.alterTable("transactions", (table) => {
    if (!hasBatchId) {
      table.integer("batch_id").unsigned().nullable();
      table.foreign("batch_id").references("id").inTable("payment_batches").onDelete("SET NULL");
    }

    if (!hasBatchItemIndex) {
      table.integer("batch_item_index").unsigned().nullable();
    }
  });

  if (!hasBatchId || !hasBatchItemIndex) {
    await knex.schema.alterTable("transactions", (table) => {
      table.index(["batch_id", "batch_item_index"]);
    });
  }
};

export const down = async function (knex) {
  const hasBatchId = await knex.schema.hasColumn("transactions", "batch_id");
  const hasBatchItemIndex = await knex.schema.hasColumn("transactions", "batch_item_index");

  if (hasBatchId || hasBatchItemIndex) {
    await knex.schema.alterTable("transactions", (table) => {
      table.dropIndex(["batch_id", "batch_item_index"]);
      if (hasBatchId) {
        table.dropForeign("batch_id");
        table.dropColumn("batch_id");
      }
      if (hasBatchItemIndex) {
        table.dropColumn("batch_item_index");
      }
    });
  }

  await knex.schema.dropTableIfExists("payment_batches");
};
