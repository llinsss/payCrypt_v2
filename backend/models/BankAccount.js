/**
 * BankAccount model — wraps database access for the `bank_accounts` table.
 *
 * Issue #459: `account_number` is encrypted with AES-256-GCM before write and
 * decrypted transparently on read.
 */
import db from "../config/database.js";
import { encrypt, decrypt, isEncrypted } from "../utils/encryption.js";

/** Fields that must be encrypted at rest. */
const PII_FIELDS = ["account_number"];

/**
 * Encrypt PII fields in bank account data before writing to the database.
 *
 * @param {Record<string, unknown>} data
 * @returns {Record<string, unknown>}
 */
function encryptPii(data) {
  if (!data) return data;
  const result = { ...data };
  for (const field of PII_FIELDS) {
    if (result[field] !== undefined) {
      result[field] = encrypt(result[field]);
    }
  }
  return result;
}

/**
 * Decrypt PII fields in a bank account record returned from the database.
 * Values that are not in our encrypted format are returned unchanged so that
 * pre-migration plaintext records degrade gracefully.
 *
 * @param {Record<string, unknown>|null} record
 * @returns {Record<string, unknown>|null}
 */
function decryptPii(record) {
  if (!record) return record;
  const result = { ...record };
  for (const field of PII_FIELDS) {
    if (result[field] !== undefined && result[field] !== null) {
      if (isEncrypted(result[field])) {
        result[field] = decrypt(result[field]);
      }
    }
  }
  return result;
}

const BankAccount = {
  async create(bankAccountData) {
    const [id] = await db("bank_accounts").insert(encryptPii(bankAccountData));
    return this.findById(id);
  },

  async findById(id) {
    const record = await db("bank_accounts")
      .select("bank_accounts.*", "users.email", "users.tag")
      .leftJoin("users", "bank_accounts.user_id", "users.id")
      .where("bank_accounts.id", id)
      .first();
    return decryptPii(record);
  },

  async findByAccountNumber(accountNumber, bankCode) {
    // Encrypt the search value to find the matching encrypted row.
    // Note: because each encryption uses a random IV the ciphertext differs
    // per call, so this method falls back to a full-table scan with in-memory
    // comparison.  For production at scale, consider a separate HMAC index
    // column for deterministic lookups.
    const records = await db("bank_accounts").where({ bank_code: bankCode });
    for (const record of records) {
      const decrypted = decryptPii(record);
      if (decrypted.account_number === accountNumber) {
        return decrypted;
      }
    }
    return null;
  },

  async getAll(limit = 10, offset = 0) {
    const records = await db("bank_accounts")
      .select("bank_accounts.*", "users.email", "users.tag")
      .leftJoin("users", "bank_accounts.user_id", "users.id")
      .limit(limit)
      .offset(offset)
      .orderBy("bank_accounts.created_at", "desc");
    return records.map(decryptPii);
  },

  async getByUserId(user_id) {
    const record = await db("bank_accounts").where({ user_id }).first();
    return decryptPii(record);
  },

  async update(id, bankAccountData) {
    await db("bank_accounts")
      .where({ id })
      .update({
        ...encryptPii(bankAccountData),
        updated_at: db.fn.now(),
      });
    return this.findById(id);
  },

  async delete(id) {
    return await db("bank_accounts").where({ id }).del();
  },
};

export default BankAccount;
