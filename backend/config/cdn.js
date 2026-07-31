/**
 * CDN asset delivery configuration.
 *
 * Static assets (chain and token logos, email template images) are cacheable and
 * identical for every user, so they belong on a CDN rather than on the
 * application server — particularly for users far from where the app is hosted.
 *
 * This module is the seam that makes that switch possible without touching call
 * sites: when `CDN_BASE_URL` is unset, `assetUrl` returns the original app-server
 * path and behaviour is exactly as before, so it is safe to deploy ahead of the
 * bucket and distribution existing.
 *
 * Receipt PDFs and data exports are deliberately *not* covered here. They are
 * per-user financial documents and must never be publicly cacheable — see
 * CACHE_CONTROL.private below and the note in the pull request.
 */

/** Base URL of the CDN distribution, e.g. https://dxxxx.cloudfront.net. */
export const CDN_BASE_URL = (process.env.CDN_BASE_URL || "").replace(/\/+$/, "");

/** Bucket backing the distribution. Only needed once uploads are wired up. */
export const S3_BUCKET = process.env.S3_BUCKET || "";

/** True when asset requests should be pointed at the CDN. */
export const cdnEnabled = () => CDN_BASE_URL.length > 0;

/**
 * Cache-Control values by asset class.
 *
 * The distinction matters more than the durations: anything user-specific must
 * be `no-store` so it is never held in a shared cache, however convenient
 * caching it would be.
 */
export const CACHE_CONTROL = Object.freeze({
  /** Logos and other immutable public assets — one week. */
  publicAsset: "public, max-age=604800",
  /** Receipts, exports, anything scoped to one user. */
  private: "private, no-store",
});

/**
 * Resolve a static asset path to the URL clients should fetch.
 *
 * Falls back to the given path unchanged when no CDN is configured, so this can
 * be adopted incrementally.
 *
 * @param {string} assetPath path relative to the asset root, e.g. "logos/xlm.svg"
 * @returns {string} CDN URL when configured, otherwise the original path
 */
export function assetUrl(assetPath = "") {
  if (!assetPath) return "";

  // Already absolute — an external logo URL, for instance. Leave it alone.
  if (/^https?:\/\//i.test(assetPath)) return assetPath;

  const normalised = assetPath.replace(/^\/+/, "");
  return cdnEnabled() ? `${CDN_BASE_URL}/${normalised}` : `/${normalised}`;
}

/**
 * Cache-Control header for a static asset response served by the app itself.
 *
 * Useful while assets are still served locally: the header is correct either
 * way, so moving them to the CDN later does not change caching semantics.
 */
export function assetCacheControl({ isPrivate = false } = {}) {
  return isPrivate ? CACHE_CONTROL.private : CACHE_CONTROL.publicAsset;
}
