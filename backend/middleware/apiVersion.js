// Version registry: bump CURRENT_VERSION when a new version becomes the
// default, and add an entry to DEPRECATIONS when an older version starts
// its sunset window.
export const CURRENT_VERSION = 2;

export const DEPRECATIONS = {
  1: {
    // RFC 8594 `Deprecation`/`Sunset` headers take HTTP-dates.
    deprecatedAt: new Date("2025-01-01T00:00:00Z"),
    sunsetAt: new Date("2025-12-31T00:00:00Z"),
    migrationGuide: "/docs/API_MIGRATION_V1_TO_V2.md",
  },
};

/**
 * Reads the version segment out of the request path (e.g. /v1/users -> 'v1')
 * and stores it on req.apiVersion. Falls back to the current version when no
 * segment is present (unversioned routes are aliased to the current version).
 */
export const versionDetection = (req, res, next) => {
  const segment = req.path.split("/")[1];
  const match = segment?.match(/^v(\d+)$/);
  req.apiVersion = match ? Number(match[1]) : CURRENT_VERSION;
  next();
};

/**
 * Sets X-API-Version on every response for this version, plus the standard
 * Deprecation/Sunset headers (RFC 8594) when the version has an active
 * deprecation entry.
 */
export const versionHeaders = (version) => (req, res, next) => {
  res.setHeader("X-API-Version", String(version));

  const deprecation = DEPRECATIONS[version];
  if (deprecation) {
    res.setHeader("Deprecation", deprecation.deprecatedAt.toUTCString());
    res.setHeader("Sunset", deprecation.sunsetAt.toUTCString());
    res.setHeader(
      "Link",
      `<${deprecation.migrationGuide}>; rel="deprecation"`,
    );
    res.setHeader(
      "Warning",
      `299 - "API v${version} is deprecated. Please migrate to v${CURRENT_VERSION}. Sunset: ${deprecation.sunsetAt.toUTCString()}"`,
    );
  }
  next();
};
