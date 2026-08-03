/**
 * Migration: Add NDPR compliance tables and columns.
 *
 * Issue #460 — Adds the database structures required for:
 *   1. Personal data exports (data_exports table)
 *   2. Soft account deletion with 30-day grace period
 *      (account_status, scheduled_deletion_at, cancellation_token columns on users)
 */

export const up = async (knex) => {
  // -------------------------------------------------------------------------
  // 1. data_exports — stores temporary base64-encoded personal data archives
  //    until the user downloads them (one-time use, 24-hour TTL).
  // -------------------------------------------------------------------------
  const dataExportsExists = await knex.schema.hasTable("data_exports");
  if (!dataExportsExists) {
    await knex.schema.createTable("data_exports", (table) => {
      table.increments("id").primary();
      table.integer("user_id").unsigned().notNullable();
      table.text("payload").notNullable(); // base64-encoded JSON archive
      table.timestamp("expires_at").notNullable();
      table.timestamp("created_at").defaultTo(knex.fn.now());

      table
        .foreign("user_id")
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      table.index("user_id");
      table.index("expires_at"); // for cleanup job
    });
  }

  // -------------------------------------------------------------------------
  // 2. users table — add soft-deletion columns if they don't already exist.
  // -------------------------------------------------------------------------
  const hasAccountStatus = await knex.schema.hasColumn("users", "account_status");
  if (!hasAccountStatus) {
    await knex.schema.table("users", (table) => {
      // 'active' | 'pending_deletion' | 'deleted'
      table.string("account_status", 50).defaultTo("active").notNullable();
      table.index("account_status");
    });
  }

  const hasScheduledDeletionAt = await knex.schema.hasColumn("users", "scheduled_deletion_at");
  if (!hasScheduledDeletionAt) {
    await knex.schema.table("users", (table) => {
      table.timestamp("scheduled_deletion_at").nullable();
    });
  }

  const hasCancellationToken = await knex.schema.hasColumn("users", "cancellation_token");
  if (!hasCancellationToken) {
    await knex.schema.table("users", (table) => {
      // Unique hex token issued to the user when deletion is initiated.
      table.string("cancellation_token", 64).nullable().unique();
    });
  }
};

export const down = async (knex) => {
  // Remove soft-deletion columns from users
  if (await knex.schema.hasColumn("users", "cancellation_token")) {
    await knex.schema.table("users", (table) => {
      table.dropColumn("cancellation_token");
    });
  }
  if (await knex.schema.hasColumn("users", "scheduled_deletion_at")) {
    await knex.schema.table("users", (table) => {
      table.dropColumn("scheduled_deletion_at");
    });
  }
  if (await knex.schema.hasColumn("users", "account_status")) {
    await knex.schema.table("users", (table) => {
      table.dropColumn("account_status");
    });
  }

  // Drop data_exports table
  await knex.schema.dropTableIfExists("data_exports");
};
