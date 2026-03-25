import distributedLock from "../utils/distributedLock.js";

/**
 * Service for managing common locks across the application
 */
class LockService {
  /**
   * Obtain a lock for a user's transaction
   * @param {number|string} userId
   * @param {number} ttl
   * @returns {Promise<string|null>}
   */
  async acquireUserLock(userId, ttl = 15000) {
    return await distributedLock.acquire(`user:${userId}:txn`, ttl);
  }

  /**
   * Release a user's transaction lock
   * @param {number|string} userId
   * @param {string} identifier
   * @returns {Promise<boolean>}
   */
  async releaseUserLock(userId, identifier) {
    return await distributedLock.release(`user:${userId}:txn`, identifier);
  }

  /**
   * Generic wrapper for locked execution
   * @param {string} key
   * @param {Function} task - Async function to execute
   * @param {number} ttl
   * @returns {Promise<any>}
   */
  async withLock(key, task, ttl = 10000) {
    const identifier = await distributedLock.acquire(key, ttl);
    if (!identifier) {
      throw new Error(`Failed to acquire lock for key: ${key}`);
    }

    try {
      return await task();
    } finally {
      await distributedLock.release(key, identifier);
    }
  }
}

export default new LockService();
