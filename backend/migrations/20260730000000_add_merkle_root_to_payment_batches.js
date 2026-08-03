/**
 * Adds a `merkle_root` column to `payment_batches` (issue #448).
 *
 * The root commits to every payment leaf (recipient + amount + token) in the
 * batch. It is computed before execution and each leaf's proof is verified
 * against it immediately before that payment runs, making batch tampering
 * detectable.
 */
export const up = async function (knex) {
  const hasColumn = await knex.schema.hasColumn("payment_batches", "merkle_root");
  if (!hasColumn) {
    await knex.schema.alterTable("payment_batches", (table) => {
      table.string("merkle_root", 66).nullable().comment(
        "0x-prefixed keccak256 Merkle root over batch payment leaves (integrity check)",
      );
    });
  }
};

export const down = async function (knex) {
  const hasColumn = await knex.schema.hasColumn("payment_batches", "merkle_root");
  if (hasColumn) {
    await knex.schema.alterTable("payment_batches", (table) => {
      table.dropColumn("merkle_root");
    });
  }
};
