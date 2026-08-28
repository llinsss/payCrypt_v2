import db from "../config/database.js";
import bcrypt from "bcrypt";

const BCRYPT_ROUNDS = 12;

const RefreshToken = {
  /**
   * Hash a refresh token using bcrypt
   */
  async hashToken(token) {
    return bcrypt.hash(token, BCRYPT_ROUNDS);
  },

  /**
   * Verify a token against its stored hash
   */
  async verifyTokenHash(token, hash) {
    return bcrypt.compare(token, hash);
  },

  /**
   * Create a new refresh token record
   */
  async create(userId, tokenHash, expiresAt, ipAddress, userAgent) {
    const [id] = await db("refresh_tokens").insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      ip_address: ipAddress,
      user_agent: userAgent,
      created_at: new Date(),
    });
    return this.findById(id);
  },

  /**
   * Find token by hash (does NOT verify it's unused)
   */
  async findByHash(hash) {
    return await db("refresh_tokens").where("token_hash", hash).first();
  },

  /**
   * Find a valid (not yet used, not expired) token by its hash
   */
  async findValidByHash(hash) {
    const now = new Date();
    return await db("refresh_tokens")
      .where("token_hash", hash)
      .where("expires_at", ">", now)
      .whereNull("used_at")
      .first();
  },

  /**
   * Find by ID
   */
  async findById(id) {
    return await db("refresh_tokens").where("id", id).first();
  },

  /**
   * Mark a token as used (single-use enforcement)
   */
  async markAsUsed(id) {
    const now = new Date();
    return await db("refresh_tokens").where("id", id).update({
      used_at: now,
    });
  },

  /**
   * Find all active tokens for a user
   */
  async findActiveByUserId(userId) {
    const now = new Date();
    return await db("refresh_tokens")
      .where("user_id", userId)
      .where("expires_at", ">", now)
      .whereNull("used_at");
  },

  /**
   * Revoke all tokens for a user (full session revocation on replay detection)
   */
  async revokeAllByUserId(userId) {
    const now = new Date();
    return await db("refresh_tokens")
      .where("user_id", userId)
      .update({
        used_at: now,
      });
  },

  /**
   * Delete expired tokens (cleanup)
   */
  async deleteExpiredTokens() {
    const now = new Date();
    return await db("refresh_tokens").where("expires_at", "<", now).del();
  },
};

export default RefreshToken;
