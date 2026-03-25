export const up = async (knex) => {
  const hasSecret = await knex.schema.hasColumn("users", "two_factor_secret");
  const hasEnabled = await knex.schema.hasColumn("users", "two_factor_enabled");
  const hasBackupCodes = await knex.schema.hasColumn("users", "two_factor_backup_codes");

  return knex.schema.alterTable("users", (table) => {
    if (!hasSecret) {
      table.string("two_factor_secret", 255).nullable();
    }

    if (!hasEnabled) {
      table.boolean("two_factor_enabled").notNullable().defaultTo(false);
    }

    if (!hasBackupCodes) {
      table.text("two_factor_backup_codes").nullable();
    }
  });
};

export const down = async (knex) => {
  const hasSecret = await knex.schema.hasColumn("users", "two_factor_secret");
  const hasEnabled = await knex.schema.hasColumn("users", "two_factor_enabled");
  const hasBackupCodes = await knex.schema.hasColumn("users", "two_factor_backup_codes");

  return knex.schema.alterTable("users", (table) => {
    if (hasSecret) {
      table.dropColumn("two_factor_secret");
    }

    if (hasEnabled) {
      table.dropColumn("two_factor_enabled");
    }

    if (hasBackupCodes) {
      table.dropColumn("two_factor_backup_codes");
    }
  });
};
