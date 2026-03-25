/**
 * Tests for createUserRateLimiter fail-safe behaviour (Issue #222)
 *
 * Verifies that rate limiting is NEVER silently disabled when Redis is
 * unavailable. Two failure modes are exercised:
 *   (a) Redis client is missing expected sorted-set methods
 *   (b) Redis client throws a runtime error
 *
 * Scenarios:
 *  1. Missing sorted-set methods, strict:false → in-memory fallback enforces limit
 *  2. Redis throws, strict:false              → in-memory fallback enforces limit
 *  3. Missing sorted-set methods, strict:true → 503 on every request
 *  4. Redis throws, strict:true               → 503 on every request
 *  5. Healthy Redis                           → normal 200 then 429 at max
 */

import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal Express app that applies one createUserRateLimiter instance.
 * The redis.js module is replaced with a controlled mock before each test.
 */
async function buildApp(redisMock, limiterOpts) {
  // Jest ESM mock must be registered before importing the module under test
  jest.unstable_mockModule("../config/redis.js", () => ({
    default: redisMock,
  }));

  // Re-import to pick up the fresh mock
  const { createUserRateLimiter } = await import("../config/rateLimiting.js");
  const limiter = createUserRateLimiter(limiterOpts);

  const app = express();
  app.get("/test", limiter, (req, res) => res.status(200).json({ ok: true }));
  return app;
}

// Build a healthy Redis mock that correctly simulates the sliding window
function makeHealthyRedis(max) {
  // Simple in-process sorted-set simulation
  const store = {};
  return {
    zRemRangeByScore: jest.fn(async (key) => { store[key] = store[key] || []; }),
    zCard: jest.fn(async (key) => (store[key] || []).length),
    zAdd: jest.fn(async (key, { score, value }) => {
      store[key] = store[key] || [];
      store[key].push({ score, value });
    }),
    expire: jest.fn(async () => {}),
    _resetStore: () => { Object.keys(store).forEach((k) => delete store[k]); },
    _store: store,
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("createUserRateLimiter — Issue #222 fail-safe behaviour", () => {
  // Isolate module registry between tests so mocks don't bleed through
  beforeEach(() => jest.resetModules());

  // ── 1. Missing sorted-set methods, strict:false → fallback enforces limit ──
  it("non-strict: enforces in-memory limit when Redis lacks sorted-set methods", async () => {
    const degradedRedis = {}; // no zRemRangeByScore — triggers method check

    const app = await buildApp(degradedRedis, {
      windowMs: 60_000,
      max: 2,
      type: "test-nosorted",
      strict: false,
    });

    // First two requests should pass (within limit)
    const r1 = await request(app).get("/test");
    expect(r1.status).toBe(200);
    expect(r1.headers["x-ratelimit-fallback"]).toBe("in-memory");

    const r2 = await request(app).get("/test");
    expect(r2.status).toBe(200);

    // Third request exceeds in-memory limit → 429 (NOT open)
    const r3 = await request(app).get("/test");
    expect(r3.status).toBe(429);
  });

  // ── 2. Redis throws, strict:false → fallback enforces limit ───────────────
  it("non-strict: enforces in-memory limit when Redis throws a runtime error", async () => {
    const throwingRedis = {
      zRemRangeByScore: jest.fn(async () => { throw new Error("ECONNREFUSED"); }),
    };

    const app = await buildApp(throwingRedis, {
      windowMs: 60_000,
      max: 2,
      type: "test-throws",
      strict: false,
    });

    const r1 = await request(app).get("/test");
    expect(r1.status).toBe(200);

    const r2 = await request(app).get("/test");
    expect(r2.status).toBe(200);

    // Limit reached — in-memory store blocks
    const r3 = await request(app).get("/test");
    expect(r3.status).toBe(429);
  });

  // ── 3. Missing sorted-set methods, strict:true → 503 ─────────────────────
  it("strict: returns 503 when Redis lacks sorted-set methods", async () => {
    const degradedRedis = {};

    const app = await buildApp(degradedRedis, {
      windowMs: 60_000,
      max: 100,
      type: "test-strict-nosorted",
      strict: true,
    });

    const r = await request(app).get("/test");
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ error: expect.stringContaining("unavailable") });
  });

  // ── 4. Redis throws, strict:true → 503 ───────────────────────────────────
  it("strict: returns 503 when Redis throws a runtime error", async () => {
    const throwingRedis = {
      zRemRangeByScore: jest.fn(async () => { throw new Error("Redis timeout"); }),
    };

    const app = await buildApp(throwingRedis, {
      windowMs: 60_000,
      max: 100,
      type: "test-strict-throws",
      strict: true,
    });

    const r = await request(app).get("/test");
    expect(r.status).toBe(503);
  });

  // ── 5. Healthy Redis → normal flow, 429 at max ────────────────────────────
  it("healthy Redis: allows requests within limit and blocks at max", async () => {
    const healthyRedis = makeHealthyRedis(1);

    const app = await buildApp(healthyRedis, {
      windowMs: 60_000,
      max: 1,
      type: "test-healthy",
      strict: false,
    });

    const r1 = await request(app).get("/test");
    expect(r1.status).toBe(200);
    expect(r1.headers["x-ratelimit-remaining"]).toBe("0"); // 1 used out of 1 → 0 remaining

    const r2 = await request(app).get("/test");
    expect(r2.status).toBe(429);
  });
});
