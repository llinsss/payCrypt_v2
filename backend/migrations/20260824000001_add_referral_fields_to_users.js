export const up = async (knex) => {
  const hasTable = await knex.schema.hasTable("users");
  if (!hasTable) return;

  const hasReferralCode = await knex.schema.hasColumn("users", "referral_code");
  const hasReferredBy = await knex.schema.hasColumn("users", "referred_by");

  if (!hasReferralCode) {
    await knex.schema.table("users", (table) => {
      table.string("referral_code", 8).unique().nullable();
      table.index("referral_code");
    });
  }

  if (!hasReferredBy) {
    await knex.schema.table("users", (table) => {
      table.integer("referred_by").unsigned().nullable();
      table.foreign("referred_by").references("id").inTable("users").onDelete("SET NULL");
      table.index("referred_by");
    });
  }
};

export const down = async (knex) => {
  const hasTable = await knex.schema.hasTable("users");
  if (hasTable) {
    await knex.schema.table("users", (table) => {
      table.dropForeignKey("referred_by");
      table.dropColumn("referred_by");
      table.dropColumn("referral_code");
    });
  }
};
