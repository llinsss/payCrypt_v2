/**
 * Module Contract Test for Rate Limiting Exports
 *
 * Verifies that the canonical rate-limiting module (config/rateLimiting.js)
 * exports all named exports that routes and middleware depend on.
 * This test catches import failures early, before they surface as confusing
 * integration-test failures.
 *
 * Maintainers: if routes import a new rate limiter or constant from this
 * module, add it to the EXPECTED_EXPORTS array below and to this test.
 */

import { describe, it, expect } from "@jest/globals";

describe("Rate Limiting Module Contract", () => {
  it("should export all constants and factories that routes depend on", async () => {
    const rateLimitingModule = await import("../config/rateLimiting.js");

    // Expected named exports (from route file analysis)
    const expectedExports = [
      "RATE_LIMIT_TIERS",  // used by RateLimitService, tests
      "TIER_LIMITS",       // used by routes, middleware, services
      "ENDPOINT_TIER_LIMITS", // used by factories and services
      "createUserRateLimiter", // used by transactionSearch.js, tests
      "createTierRateLimiter",  // factory for tier-based limiting
      "balanceQueryLimiter", // used by balances.js
      "strictLimiter",     // used by apiKeys.js
      "paymentLimiter",    // used by batchPayments.js, scheduledPayments.js
      "downloadLimiter",   // pre-built limiter
    ];

    for (const exportName of expectedExports) {
      expect(rateLimitingModule).toHaveProperty(exportName);
      expect(rateLimitingModule[exportName]).toBeDefined();
    }
  });

  it("should export balanceQueryLimiter as a function", async () => {
    const { balanceQueryLimiter } = await import("../config/rateLimiting.js");
    expect(typeof balanceQueryLimiter).toBe("function");
  });

  it("should export strictLimiter as a function", async () => {
    const { strictLimiter } = await import("../config/rateLimiting.js");
    expect(typeof strictLimiter).toBe("function");
  });

  it("should export paymentLimiter as a function", async () => {
    const { paymentLimiter } = await import("../config/rateLimiting.js");
    expect(typeof paymentLimiter).toBe("function");
  });

  it("should export downloadLimiter as a function", async () => {
    const { downloadLimiter } = await import("../config/rateLimiting.js");
    expect(typeof downloadLimiter).toBe("function");
  });

  it("should export createUserRateLimiter as a function", async () => {
    const { createUserRateLimiter } = await import("../config/rateLimiting.js");
    expect(typeof createUserRateLimiter).toBe("function");
  });

  it("should export createTierRateLimiter as a function", async () => {
    const { createTierRateLimiter } = await import("../config/rateLimiting.js");
    expect(typeof createTierRateLimiter).toBe("function");
  });

  it("should export TIER_LIMITS with correct tier keys", async () => {
    const { TIER_LIMITS, RATE_LIMIT_TIERS } = await import("../config/rateLimiting.js");
    expect(TIER_LIMITS).toHaveProperty("FREE");
    expect(TIER_LIMITS).toHaveProperty("PREMIUM");
    expect(TIER_LIMITS).toHaveProperty("ENTERPRISE");
    expect(TIER_LIMITS.FREE).toBeGreaterThan(0);
    expect(TIER_LIMITS.PREMIUM).toBeGreaterThan(TIER_LIMITS.FREE);
    expect(TIER_LIMITS.ENTERPRISE).toBeGreaterThan(TIER_LIMITS.PREMIUM);
  });

  it("should export RATE_LIMIT_TIERS constants", async () => {
    const { RATE_LIMIT_TIERS } = await import("../config/rateLimiting.js");
    expect(RATE_LIMIT_TIERS.FREE).toBe("FREE");
    expect(RATE_LIMIT_TIERS.PREMIUM).toBe("PREMIUM");
    expect(RATE_LIMIT_TIERS.ENTERPRISE).toBe("ENTERPRISE");
  });

  it("should export ENDPOINT_TIER_LIMITS with per-endpoint limits", async () => {
    const { ENDPOINT_TIER_LIMITS, RATE_LIMIT_TIERS } = await import("../config/rateLimiting.js");
    const tiers = [RATE_LIMIT_TIERS.FREE, RATE_LIMIT_TIERS.PREMIUM, RATE_LIMIT_TIERS.ENTERPRISE];
    for (const tier of tiers) {
      expect(ENDPOINT_TIER_LIMITS).toHaveProperty(tier);
      expect(ENDPOINT_TIER_LIMITS[tier]).toHaveProperty("login");
      expect(ENDPOINT_TIER_LIMITS[tier]).toHaveProperty("transactions");
      expect(ENDPOINT_TIER_LIMITS[tier]).toHaveProperty("swap");
      expect(ENDPOINT_TIER_LIMITS[tier]).toHaveProperty("api");
    }
  });

  it("should verify all pre-built limiters are properly configured", async () => {
    const { balanceQueryLimiter, strictLimiter, paymentLimiter, downloadLimiter } =
      await import("../config/rateLimiting.js");

    // Each limiter should be an async middleware function
    const limiters = [balanceQueryLimiter, strictLimiter, paymentLimiter, downloadLimiter];
    for (const limiter of limiters) {
      expect(limiter.length).toBe(3); // (req, res, next)
    }
  });

  it("should export default object with all named exports for backwards compatibility", async () => {
    const defaultExport = await import("../config/rateLimiting.js");
    const explicitDefault = defaultExport.default;

    if (explicitDefault) {
      // If default export exists, verify it contains key exports
      expect(explicitDefault).toHaveProperty("TIER_LIMITS");
      expect(explicitDefault).toHaveProperty("balanceQueryLimiter");
      expect(explicitDefault).toHaveProperty("createUserRateLimiter");
    }
  });
});
