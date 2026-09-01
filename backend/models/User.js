/**
 * User model — wraps database access for the `users` table.
 *
 * Issue #459: `phone_number` is encrypted with AES-256-GCM before write and
 * decrypted transparently on read.
 */
import db from "../config/database.js";
import bcrypt from "bcrypt";
import NotificationPreference from "./NotificationPreference.js";
import { encrypt, decrypt, isEncrypted } from "../utils/encryption.js";

/** PII fields stored encrypted. */
const PII_FIELDS = ["phone_number"];

/**
 * Encrypt PII fields in user data before writing to the database.
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
 * Decrypt PII fields in a user record returned from the database.
 * Values not matching our encrypted format are returned unchanged so that
 * pre-migration plaintext rows degrade gracefully.
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

const User = {
  async findByEmail(email) {
    return decryptPii(await db("users").where({ email }).first());
  },

  async findByEntity(entity) {
    return decryptPii(
      await db("users")
        .where("email", entity)
        .orWhere("tag", entity)
        .first()
    );
  },
  async findByTag(tag) {
    return decryptPii(await db("users").where({ tag }).first());
  },

  async findByAddress(address) {
    return decryptPii(await db("users").where({ address }).first());
  },

  async findById(id) {
    return decryptPii(await db("users").where({ id }).first());
  },

  async setTwoFactorSecret(id, secret) {
    await db("users")
      .where({ id })
      .update({
        two_factor_secret: secret,
        updated_at: db.fn.now(),
      });

    return this.findById(id);
  },

  async enableTwoFactor(id, backupCodes = []) {
    await db("users")
      .where({ id })
      .update({
        two_factor_enabled: true,
        two_factor_backup_codes: JSON.stringify(backupCodes),
        updated_at: db.fn.now(),
      });

    return this.findById(id);
  },

  async updateBackupCodes(id, backupCodes = []) {
    await db("users")
      .where({ id })
      .update({
        two_factor_backup_codes: JSON.stringify(backupCodes),
        updated_at: db.fn.now(),
      });

    return this.findById(id);
  },

  getBackupCodes(user) {
    if (!user?.two_factor_backup_codes) return [];

    if (Array.isArray(user.two_factor_backup_codes)) {
      return user.two_factor_backup_codes;
    }

    try {
      const parsed = JSON.parse(user.two_factor_backup_codes);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  async findByIds(ids) {
    const records = await db("users").whereIn("id", ids);
    return records.map(decryptPii);
  },

  async create(userData) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const [id] = await db("users").insert({
      ...encryptPii(userData),
      password: hashedPassword,
      two_factor_secret: null,
      two_factor_enabled: false,
      two_factor_backup_codes: JSON.stringify([]),
    });
    return this.findById(id);
  },

  async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  },

  async getAll(limit = 10, offset = 0) {
    const records = await db("users")
      .select(
        "id",
        "tag",
        "address",
        "photo",
        "email",
        "kyc_status",
        "currency_preference",
        "tier",
        "created_at"
      )
      .limit(limit)
      .offset(offset)
      .orderBy("created_at", "desc");
    return records.map(decryptPii);
  },

  async update(id, userData) {
    if (userData.password) {
      userData.password = await bcrypt.hash(userData.password, 10);
    }

    await db("users")
      .where({ id })
      .update({
        ...encryptPii(userData),
        updated_at: db.fn.now(),
      });

    return this.findById(id);
  },

  async delete(id) {
    return await db("users").where({ id }).del();
  },

  async getNotificationPreferences(id) {
    return await NotificationPreference.getOrCreate(id);
  },

  async updateNotificationPreferences(id, preferences) {
    return await NotificationPreference.update(id, preferences);
  },

  async updateTier(id, tier) {
    await db("users")
      .where({ id })
      .update({
        tier,
        updated_at: db.fn.now(),
      });

    return this.findById(id);
  },
};

export default User;
