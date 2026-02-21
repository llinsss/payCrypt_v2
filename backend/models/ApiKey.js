import db from "../config/database.js";
import crypto from "crypto";
import ipRangeCheck from "ip-range-check";

const ApiKey = {
  /**
   * Generate a new API key
   */
  generateKey() {
    return crypto.randomBytes(32).toString("hex");
  },

  /**
   * Create a new API key
   */
  async create(userId, data) {
    const key = this.generateKey();
    const [id] = await db("api_keys").insert({
      user_id: userId,
      key,
      name: data.name,
      scopes: data.scopes || "read,write",
      ip_whitelist: data.ipWhitelist || null,
      is_active: true,
      rotation_interval_days: data.rotationIntervalDays || null,
      next_rotation_at: data.rotationIntervalDays
        ? new Date(Date.now() + data.rotationIntervalDays * 24 * 60 * 60 * 1000)
        : null,
      created_at: new Date(),
    });

    // Add audit log
    await this.addAuditLog(id, userId, "CREATED", { name: data.name });

    return this.findById(id);
  },

  /**
   * Find API key by key value
   */
  async findByKey(key) {
    const now = new Date();
    return await db("api_keys")
      .where({ key, is_active: true })
      .where((builder) => {
        builder.where("expires_at", ">", now).orWhereNull("expires_at");
      })
      .where((builder) => {
        builder.where("transition_ends_at", ">", now).orWhereNull("transition_ends_at");
      })
      .first();
  },

  /**
   * Find API key by ID
   */
  async findById(id) {
    return await db("api_keys").where({ id }).first();
  },

  /**
   * Find all API keys for a user
   */
  async findByUserId(userId) {
    return await db("api_keys")
      .where({ user_id: userId })
      .where("deleted_at", null)
      .orderBy("created_at", "desc");
  },

  /**
   * Update API key
   */
  async update(id, data) {
    const updateData = {
      name: data.name,
      scopes: data.scopes,
      ip_whitelist: data.ipWhitelist,
      is_active: data.isActive,
      rotation_interval_days: data.rotationIntervalDays,
      updated_at: new Date(),
    };

    if (data.rotationIntervalDays !== undefined) {
      updateData.next_rotation_at = data.rotationIntervalDays
        ? new Date(Date.now() + data.rotationIntervalDays * 24 * 60 * 60 * 1000)
        : null;
    }

    await db("api_keys").where({ id }).update(updateData);

    const apiKey = await this.findById(id);
    await this.addAuditLog(id, apiKey.user_id, "UPDATED", data);

    return apiKey;
  },

  /**
   * Soft delete API key
   */
  async delete(id) {
    return await db("api_keys").where({ id }).update({
      deleted_at: new Date(),
      is_active: false,
    });
  },

  /**
   * Permanently delete API key
   */
  async hardDelete(id) {
    return await db("api_keys").where({ id }).del();
  },

  /**
   * Revoke API key
   */
  async revoke(id) {
    const apiKey = await this.findById(id);
    if (apiKey) {
      await this.addAuditLog(id, apiKey.user_id, "REVOKED");
    }
    return await db("api_keys").where({ id }).update({
      is_active: false,
      deleted_at: new Date(),
    });
  },

  /**
   * Rotate API key (create new one and revoke old)
   */
  async rotate(id, transitionDays = 1) {
    const oldApiKey = await this.findById(id);
    if (!oldApiKey) {
      throw new Error("API key not found");
    }

    const newKeyString = this.generateKey();
    const now = new Date();
    
    // Set transition period for old key (it remains active until transition_ends_at)
    const transitionEndsAt = new Date(now.getTime() + transitionDays * 24 * 60 * 60 * 1000);
    
    await db("api_keys").where({ id }).update({
      transition_ends_at: transitionEndsAt,
      last_rotated_at: now,
    });

    // Create new key with same settings
    const [newId] = await db("api_keys").insert({
      user_id: oldApiKey.user_id,
      key: newKeyString,
      name: `${oldApiKey.name} (rotated ${now.toLocaleDateString()})`,
      scopes: oldApiKey.scopes,
      ip_whitelist: oldApiKey.ip_whitelist,
      is_active: true,
      rotation_interval_days: oldApiKey.rotation_interval_days,
      next_rotation_at: oldApiKey.rotation_interval_days
        ? new Date(now.getTime() + oldApiKey.rotation_interval_days * 24 * 60 * 60 * 1000)
        : null,
      created_at: now,
    });

    // Add audit logs
    await this.addAuditLog(id, oldApiKey.user_id, "ROTATED_OUT", { 
      new_key_id: newId,
      transition_ends_at: transitionEndsAt 
    });
    await this.addAuditLog(newId, oldApiKey.user_id, "ROTATED_IN", { 
      old_key_id: id 
    });

    return this.findById(newId);
  },

  /**
   * Add entry to api_key_audit_logs
   */
  async addAuditLog(apiKeyId, userId, action, metadata = {}) {
    try {
      await db("api_key_audit_logs").insert({
        api_key_id: apiKeyId,
        user_id: userId,
        action,
        metadata: JSON.stringify(metadata),
        created_at: new Date(),
      });
    } catch (error) {
      console.error("Failed to add API key audit log:", error);
    }
  },

  /**
   * Get keys due for rotation
   */
  async getDueForRotation() {
    return await db("api_keys")
      .where("is_active", true)
      .where("next_rotation_at", "<=", new Date())
      .whereNotNull("rotation_interval_days")
      .whereNull("deleted_at");
  },

  /**
   * Get keys with expired transition periods
   */
  async getExpiredTransitions() {
    return await db("api_keys")
      .where("is_active", true)
      .where("transition_ends_at", "<=", new Date())
      .whereNull("deleted_at");
  },

  /**
   * Cleanup expired transition keys
   */
  async cleanupExpiredTransitions() {
    const expiredKeys = await this.getExpiredTransitions();
    for (const key of expiredKeys) {
      await this.revoke(key.id);
      await this.addAuditLog(key.id, key.user_id, "TRANSITION_ENDED");
    }
    return expiredKeys.length;
  },

  /**
   * Check if API key has specific scope
   */
  async hasScope(key, requiredScope) {
    const apiKey = await this.findByKey(key);
    if (!apiKey) return false;

    const scopes = apiKey.scopes?.split(",") || [];
    return scopes.includes(requiredScope);
  },

  /**
   * Verify IP is whitelisted for API key
   */
   async isIpWhitelisted(key, ip) {
  const apiKey = await this.findByKey(key);

  // No key or no whitelist = allow all
  if (!apiKey || !apiKey.ip_whitelist) return true;

  const entries = apiKey.ip_whitelist
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  // Support exact IP and CIDR
  return entries.some((entry) => {
    try {
      return ipRangeCheck(ip, entry);
    } catch (err) {
      return false;
    }
  });
},
  /**
   * Check if API key has expired
   */
  async isExpired(id) {
    const apiKey = await this.findById(id);
    if (!apiKey || !apiKey.expires_at) return false;

    return new Date(apiKey.expires_at) < new Date();
  },

  /**
   * Get API key usage stats
   */
  async getUsageStats(id) {
    const apiKey = await this.findById(id);
    if (!apiKey) return null;

    return {
      id: apiKey.id,
      name: apiKey.name,
      createdAt: apiKey.created_at,
      lastUsedAt: apiKey.last_used_at,
      daysOld: Math.floor(
        (new Date() - new Date(apiKey.created_at)) / (1000 * 60 * 60 * 24)
      ),
      daysSinceLastUse: apiKey.last_used_at
        ? Math.floor((new Date() - new Date(apiKey.last_used_at)) / (1000 * 60 * 60 * 24))
        : "Never used",
    };
  },
};

export default ApiKey;
