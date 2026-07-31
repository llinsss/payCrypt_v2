import { jest } from "@jest/globals";

/**
 * CDN_BASE_URL is read at module load, so each case imports the module fresh
 * with the environment it wants.
 */
async function loadCdn(env = {}) {
  jest.resetModules();
  const previous = { ...process.env };
  Object.assign(process.env, env);
  const mod = await import(`../config/cdn.js?case=${Math.random()}`);
  process.env = previous;
  return mod;
}

describe("CDN asset URLs", () => {
  it("returns app-relative paths when no CDN is configured", async () => {
    const { assetUrl, cdnEnabled } = await loadCdn({ CDN_BASE_URL: "" });

    expect(cdnEnabled()).toBe(false);
    expect(assetUrl("logos/xlm.svg")).toBe("/logos/xlm.svg");
  });

  it("rewrites to the CDN when configured", async () => {
    const { assetUrl, cdnEnabled } = await loadCdn({
      CDN_BASE_URL: "https://d123.cloudfront.net",
    });

    expect(cdnEnabled()).toBe(true);
    expect(assetUrl("logos/xlm.svg")).toBe("https://d123.cloudfront.net/logos/xlm.svg");
  });

  it("tolerates a trailing slash on the base URL and a leading slash on the path", async () => {
    const { assetUrl } = await loadCdn({ CDN_BASE_URL: "https://d123.cloudfront.net/" });

    expect(assetUrl("/logos/xlm.svg")).toBe("https://d123.cloudfront.net/logos/xlm.svg");
  });

  it("leaves absolute URLs untouched", async () => {
    const { assetUrl } = await loadCdn({ CDN_BASE_URL: "https://d123.cloudfront.net" });

    expect(assetUrl("https://example.com/logo.png")).toBe("https://example.com/logo.png");
  });

  it("returns an empty string for an empty path", async () => {
    const { assetUrl } = await loadCdn({ CDN_BASE_URL: "https://d123.cloudfront.net" });

    expect(assetUrl("")).toBe("");
  });

  it("never marks user-specific documents as publicly cacheable", async () => {
    const { assetCacheControl, CACHE_CONTROL } = await loadCdn();

    expect(assetCacheControl({ isPrivate: true })).toBe("private, no-store");
    expect(assetCacheControl()).toBe(CACHE_CONTROL.publicAsset);
    expect(CACHE_CONTROL.publicAsset).toMatch(/max-age=604800/);
  });
});
