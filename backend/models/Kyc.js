/**
 * Kyc model — wraps database access for the `kyc` table.
 *
 * Issue #459: PII fields (bvn, nin, phone_number, document_number, account_number)
 * are encrypted with AES-256-GCM before write and decrypted transparently on read.
 */
import db from "../config/database.js";
import { encrypt, decrypt, isEncrypted } from "../utils/encryption.js";

/** Fields that must be encrypted at rest. */
const PII_FIELDS = ["bvn", "nin", "phone_number", "document_number", "account_number"];

/**
 * Encrypt PII fields in a KYC data object before it is written to the database.
 * Non-PII fields are passed through unchanged.
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
 * Decrypt PII fields in a KYC record returned from the database.
 * Only decrypts values that look like our encrypted format so that existing
 * plaintext rows (pre-migration) are returned as-is rather than throwing.
 *
 * @param {Record<string, unknown>|null} record
 * @returns {Record<string, unknown>|null}
 */
function decryptPii(record) {
  if (!record) return record;
  const result = { ...record };
  for (const field of PII_FIELDS) {
    if (result[field] !== undefined && result[field] !== null) {
      // Guard: only attempt decryption on values that look encrypted.
      if (isEncrypted(result[field])) {
        result[field] = decrypt(result[field]);
      }
    }
  }
  return result;
}

const Kyc = {
  async create(kycData) {
    const [id] = await db("kyc").insert(encryptPii(kycData));
    return this.findById(id);
  },

  async findById(id) {
    const record = await db("kyc")
      .select("kyc.*", "users.email as user_email", "users.tag as user_tag")
      .leftJoin("users", "kyc.user_id", "users.id")
      .where("kyc.id", id)
      .first();
    return decryptPii(record);
  },

  async getAll(limit = 10, offset = 0) {
    const records = await db("kyc")
      .select("kyc.*", "users.email as user_email", "users.tag as user_tag")
      .leftJoin("users", "kyc.user_id", "users.id")
      .limit(limit)
      .offset(offset)
      .orderBy("kyc.created_at", "desc");
    return records.map(decryptPii);
  },

  async getByUser(userId, limit = 10, offset = 0) {
    const records = await db("kyc")
      .where({ user_id: userId })
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
    return records.map(decryptPii);
  },

  async update(id, kycData) {
    await db("kyc")
      .where({ id })
      .update({
        ...encryptPii(kycData),
        updated_at: db.fn.now(),
      });
    return this.findById(id);
  },

  async delete(id) {
    return await db("kyc").where({ id }).del();
  },
};

export default Kyc;
