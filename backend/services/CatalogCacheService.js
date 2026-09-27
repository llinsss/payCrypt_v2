import { redisClient } from "../config/redis.js";
import logger from "../utils/logger.js";

const CACHE_VERSION_PREFIX = "cache:version:";

/**
 * Catalog-level cache versioning backed by Redis.
 *
 * Each catalog (e.g. "tokens", "chains") has a numeric version counter in
 * Redis. GET endpoints embed the current version in the ETag, and mutating
 * endpoints (POST/PUT/DELETE) bump the version — causing all previously
 * issued ETags to mismatch and clients to receive fresh data on the next
 * conditional request.
 */
class CatalogCacheService {
  /**
   * Get the current version for a catalog.
   * Returns 0 if no version key exists yet.
   */
  async getVersion(catalog) {
    try {
      const val = await redisClient.get(`${CACHE_VERSION_PREFIX}${catalog}`);
      return val ? parseInt(val, 10) : 0;
    } catch (err) {
      logger.warn(`CatalogCacheService.getVersion(${catalog}) failed: ${err.message}`);
      return 0;
    }
  }

  /**
   * Increment the version for a catalog, effectively invalidating all
   * cached responses that embed the previous version in their ETag.
   */
  async invalidate(catalog) {
    try {
      const newVersion = await redisClient.incr(`${CACHE_VERSION_PREFIX}${catalog}`);
      logger.info(`Cache invalidated for catalog "${catalog}" — version is now ${newVersion}`);
      return newVersion;
    } catch (err) {
      logger.warn(`CatalogCacheService.invalidate(${catalog}) failed: ${err.message}`);
      return 0;
    }
  }
}

export const catalogCacheService = new CatalogCacheService();
export default catalogCacheService;
