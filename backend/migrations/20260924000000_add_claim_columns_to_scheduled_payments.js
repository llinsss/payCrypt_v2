// Claim columns let multiple scheduler replicas atomically claim due rows so
// each scheduled payment is executed once. A claim expires at
// claim_expires_at, after which another replica may recover the row.
export const up = async (knex) => {
  const hasClaimedBy = await knex.schema.hasColumn("scheduled_payments", "claimed_by");
  const hasClaimExpiresAt = await knex.schema.hasColumn("scheduled_payments", "claim_expires_at");

  await knex.schema.alterTable("scheduled_payments", (table) => {
    if (!hasClaimedBy) {
      table.string("claimed_by", 128).nullable();
    }
    if (!hasClaimExpiresAt) {
      table.timestamp("claim_expires_at").nullable();
      table.index(["status", "claim_expires_at"]);
    }
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable("scheduled_payments", (table) => {
    table.dropIndex(["status", "claim_expires_at"]);
    table.dropColumn("claimed_by");
    table.dropColumn("claim_expires_at");
  });
};
