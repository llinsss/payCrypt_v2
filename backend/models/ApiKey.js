import db from "../config/database.js";
import crypto from "crypto";

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
      created_at: new Date(),
    });

    return this.findById(id);
  },

  /**
   * Find API key by key value
   */
  async findByKey(key) {
    return await db("api_keys")
      .where({ key, is_active: true })
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
    await db("api_keys").where({ id }).update({
      name: data.name,
      scopes: data.scopes,
      ip_whitelist: data.ipWhitelist,
      is_active: data.isActive,
      updated_at: new Date(),
    });

    return this.findById(id);
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
    return await db("api_keys").where({ id }).update({
      is_active: false,
      deleted_at: new Date(),
    });
  },

  /**
   * Rotate API key (create new one and revoke old)
   */
  async rotate(id) {
    const oldKey = await this.findById(id);
    if (!oldKey) {
      throw new Error("API key not found");
    }

    // Create new key with same settings
    const newKey = await this.create(oldKey.user_id, {
      name: `${oldKey.name} (rotated)`,
      scopes: oldKey.scopes,
      ipWhitelist: oldKey.ip_whitelist,
    });

    // Revoke old key
    await this.revoke(id);

    return newKey;
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
    if (!apiKey || !apiKey.ip_whitelist) return true; // No whitelist = allow all

    const whitelistedIps = apiKey.ip_whitelist.split(",").map((i) => i.trim());
    return whitelistedIps.includes(ip);
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
