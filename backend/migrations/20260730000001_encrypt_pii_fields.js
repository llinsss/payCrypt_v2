/**
 * Migration: Encrypt existing plaintext PII fields at rest.
 *
 * Issue #459 — This migration applies AES-256-GCM encryption to any
 * plaintext values that exist in the PII columns before this fix was deployed.
 * Rows that were written after the fix (and are therefore already encrypted)
 * are detected by `isEncrypted()` and skipped.
 *
 * Columns encrypted:
 *   - users.phone_number
 *   - kyc.bvn
 *   - kyc.nin
 *   - kyc.phone_number
 *   - kyc.document_number
 *   - kyc.account_number
 *   - bank_accounts.account_number
 *
 * The down() migration is intentionally a no-op: once data is encrypted,
 * reversing to plaintext would reintroduce the security risk this migration
 * was designed to eliminate.
 */

import { encrypt, isEncrypted } from "../utils/encryption.js";

/**
 * Encrypt a single column across all rows in a table.
 *
 * @param {import('knex').Knex} knex
 * @param {string} table   - Table name
 * @param {string} column  - Column to encrypt
 * @param {string} pkCol   - Primary key column name (default: 'id')
 */
async function encryptColumn(knex, table, column, pkCol = "id") {
  const rows = await knex(table)
    .select(pkCol, column)
    .whereNotNull(column)
    .where(column, "!=", "");

  for (const row of rows) {
    const value = row[column];
    // Skip values that are already encrypted to support safe re-runs.
    if (isEncrypted(value)) continue;

    await knex(table)
      .where({ [pkCol]: row[pkCol] })
      .update({ [column]: encrypt(value) });
  }
}

export const up = async (knex) => {
  // Encrypt users.phone_number
  if (await knex.schema.hasColumn("users", "phone_number")) {
    await encryptColumn(knex, "users", "phone_number");
  }

  // Encrypt KYC PII fields
  const kycColumns = ["bvn", "nin", "phone_number", "document_number", "account_number"];
  for (const col of kycColumns) {
    if (await knex.schema.hasColumn("kyc", col)) {
      await encryptColumn(knex, "kyc", col);
    }
  }

  // Encrypt bank_accounts.account_number
  if (await knex.schema.hasColumn("bank_accounts", "account_number")) {
    await encryptColumn(knex, "bank_accounts", "account_number");
  }
};

/**
 * Down migration is intentionally a no-op.
 *
 * Decrypting PII back to plaintext would defeat the purpose of this migration
 * and reintroduce the NDPR compliance violation it was designed to fix.
 * If a rollback is truly needed, restore from a pre-migration backup instead.
 */
export const down = async (_knex) => {
  // no-op — see comment above
};
