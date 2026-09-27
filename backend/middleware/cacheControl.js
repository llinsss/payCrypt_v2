import { createHash } from "node:crypto";
import catalogCacheService from "../services/CatalogCacheService.js";

const normalizeEtag = (value) => value.replace(/^W\//, "").trim();

/**
 * Apply an explicit cache policy. JSON responses on cacheable endpoints also
 * receive a stable ETag and support conditional requests.
 */
export const cacheControl = ({ maxAge = 0, isPublic = false, noStore = false, etag = false } = {}) => {
  return (req, res, next) => {
    const policy = noStore
      ? "private, no-store"
      : `${isPublic ? "public" : "private"}, max-age=${maxAge}`;
    res.setHeader("Cache-Control", policy);

    if (!etag) return next();

    const sendJson = res.json.bind(res);
    res.json = (body) => {
      const responseBody = JSON.stringify(body);
      const entityTag = `"${createHash("sha256").update(responseBody).digest("hex")}"`;
      res.setHeader("ETag", entityTag);

      const requestTag = req.headers["if-none-match"];
      if (requestTag && requestTag.split(",").some((tag) => normalizeEtag(tag) === entityTag)) {
        return res.status(304).end();
      }

      return sendJson(body);
    };

    next();
  };
};

export const publicCache = (maxAge) => cacheControl({ maxAge, isPublic: true, etag: true });
export const privateNoStore = cacheControl({ noStore: true });

/**
 * Middleware that invalidates a catalog's cache version after a successful
 * mutation (POST/PUT/DELETE returning 2xx). Place on mutating routes.
 */
export const invalidateCache = (catalog) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        catalogCacheService.invalidate(catalog).catch(() => {});
      }
      return originalJson(body);
    };
    next();
  };
};

