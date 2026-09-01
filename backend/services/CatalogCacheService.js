import redis from "../config/redis.js";
import logger from "../utils/logger.js";

/**
 * Centralised catalog cache for token and chain GET responses.
 *
 * Keys follow a namespaced pattern so a single `invalidate(catalog)`
 * call can wipe every cached page for that catalog without scanning.
 *
 * Format: `catalog:<catalog>:<page>:<limit>`
 */

const PREFIX = "catalog:";
const DEFAULT_TTL_SECONDS = 3600; // 1 hour — matches the publicCache max-age

/** Known catalog names — used for invalidation. */
export const CATALOGS = /** @type {const} */ ({
  TOKENS: "tokens",
  CHAINS: "chains",
});

function cacheKey(catalog, page, limit) {
  return `${PREFIX}${catalog}:${page}:${limit}`;
}

function catalogPattern(catalog) {
  return `${PREFIX}${catalog}:*`;
}

/**
 * Read a cached catalog page. Returns the parsed JSON on hit, or `null` on miss.
 */
async function get(catalog, page, limit) {
  try {
    const raw = await redis.get(cacheKey(catalog, page, limit));
    if (raw) {
      logger.debug(`Catalog cache hit: ${catalog} page=${page} limit=${limit}`);
      return JSON.parse(raw);
    }
  } catch (err) {
    logger.warn(`Catalog cache read error: ${err.message}`);
  }
  return null;
}

/**
 * Store a catalog page in the cache.
 */
async function set(catalog, page, limit, data) {
  try {
    await redis.setEx(
      cacheKey(catalog, page, limit),
      DEFAULT_TTL_SECONDS,
      JSON.stringify(data),
    );
  } catch (err) {
    logger.warn(`Catalog cache write error: ${err.message}`);
  }
}

/**
 * Invalidate every cached page for the given catalog.
 *
 * Uses SCAN to avoid blocking Redis on large keyspaces.
 */
async function invalidate(catalog) {
  const pattern = catalogPattern(catalog);
  let cursor = 0;
  let totalDeleted = 0;

  try {
    do {
      const result = await redis.scan(cursor, { MATCH: pattern, COUNT: 100 });
      cursor = result.cursor;
      const keys = result.keys;
      if (keys.length > 0) {
        await redis.del(keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== 0);

    if (totalDeleted > 0) {
      logger.info(
        `Catalog cache invalidated: ${catalog} (${totalDeleted} key(s) removed)`,
      );
    }
  } catch (err) {
    logger.warn(`Catalog cache invalidation error: ${err.message}`);
  }
}

export default { get, set, invalidate, CATALOGS };
