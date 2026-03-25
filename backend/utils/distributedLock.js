import crypto from "crypto";
import redis from "../config/redis.js";

/**
 * Distributed Lock Utility using Redis
 */
class DistributedLock {
  /**
   * Acquire a distributed lock
   * @param {string} key - Lock key in Redis
   * @param {number} ttl - Lock expiration in milliseconds
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} minDelay - Minimum delay between retries in milliseconds
   * @returns {Promise<string|null>} - Lock identifier if successful, null otherwise
   */
  async acquire(key, ttl = 10000, maxRetries = 10, minDelay = 100) {
    const identifier = crypto.randomUUID();
    const lockKey = `lock:${key}`;
    let retries = 0;

    while (retries < maxRetries) {
      const result = await redis.set(lockKey, identifier, {
        NX: true,
        PX: ttl,
      });

      if (result === "OK") {
        return identifier;
      }

      retries++;
      // Exponential backoff with jitter
      const delay = Math.floor(Math.random() * (minDelay * Math.pow(2, retries))) + minDelay;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return null;
  }

  /**
   * Release a distributed lock atomically
   * @param {string} key - Lock key in Redis
   * @param {string} identifier - Lock identifier returned by acquire
   * @returns {Promise<boolean>} - True if released, false if not owner or already expired
   */
  async release(key, identifier) {
    const lockKey = `lock:${key}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(script, {
      keys: [lockKey],
      arguments: [identifier],
    });

    return result === 1;
  }
}

export default new DistributedLock();
