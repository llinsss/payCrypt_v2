import redis, { IDEMPOTENCY_PREFIX } from '../config/redis.js';
import logger from '../utils/logger.js';

class IdempotencyService {
    /**
     * Get an idempotency record from Redis
     * @param {string} key - The idempotency key
     * @returns {Promise<Object|null>} - The cached response, or null if absent/unreachable
     */
    async getRecord(key) {
        const fullKey = `${IDEMPOTENCY_PREFIX}${key}`;
        try {
            const data = await redis.get(fullKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.warn('[IdempotencyService] Redis unavailable, treating as no record', { key, error: error.message });
            return null;
        }
    }

    /**
     * Save a response to Redis with a TTL
     * @param {string} key - The idempotency key
     * @param {Object} response - The response body to cache
     * @param {number} [ttl=86400] - TTL in seconds (default 24h)
     */
    async saveResponse(key, response, ttl = parseInt(process.env.IDEMPOTENCY_TTL) || 86400) {
        const fullKey = `${IDEMPOTENCY_PREFIX}${key}`;
        try {
            await redis.set(fullKey, JSON.stringify({
                status: 'completed',
                response,
                timestamp: new Date().toISOString()
            }), {
                EX: ttl
            });
        } catch (error) {
            logger.warn('[IdempotencyService] Redis unavailable, response not cached', { key, error: error.message });
        }
    }

    /**
     * Set an "in-progress" lock for a key
     * @param {string} key - The idempotency key
     * @param {number} [lockTtl=60] - Lock TTL in seconds (default 60s)
     * @returns {Promise<boolean>} - True if lock was acquired (or Redis is unreachable), false if already locked
     */
    async setLock(key, lockTtl = 60) {
        const fullKey = `${IDEMPOTENCY_PREFIX}${key}`;
        try {
            // NX: Set only if it doesn't exist
            const result = await redis.set(fullKey, JSON.stringify({
                status: 'in-progress',
                timestamp: new Date().toISOString()
            }), {
                NX: true,
                EX: lockTtl
            });
            return result === 'OK';
        } catch (error) {
            logger.warn('[IdempotencyService] Redis unavailable, skipping idempotency lock', { key, error: error.message });
            return true;
        }
    }

    /**
     * Delete an idempotency record (e.g. on error)
     * @param {string} key - The idempotency key
     */
    async deleteRecord(key) {
        const fullKey = `${IDEMPOTENCY_PREFIX}${key}`;
        try {
            await redis.del(fullKey);
        } catch (error) {
            logger.warn('[IdempotencyService] Redis unavailable, could not release lock', { key, error: error.message });
        }
    }
}

export default new IdempotencyService();
