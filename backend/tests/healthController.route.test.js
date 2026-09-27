/**
 * Regression tests for the readiness/liveness/comprehensive-health contract
 * documented in backend/docs/OBSERVABILITY.md (issue #567).
 *
 * These exercise the existing dependency-aware routes mounted at
 * /api/health, /api/health/ready, and /api/health/live so that a future
 * change can't silently break the readiness-vs-liveness split:
 *   - /health/live must never consult dependency health.
 *   - /health/ready must fail (503) whenever the database or Redis is down.
 *   - /health must report "degraded"/"down" and a 503 whenever any
 *     dependency is unhealthy, and full detail per dependency.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

const mockCheckAllDependencies = jest.fn();
const mockGetConnectionPoolStats = jest.fn(() => ({ used: 2, free: 8, max: 10 }));
const mockGetStatus = jest.fn(() => ({ connected: true, lastEventAt: null }));

jest.unstable_mockModule("../utils/dbHealth.js", () => ({
  checkAllDependencies: mockCheckAllDependencies,
  getConnectionPoolStats: mockGetConnectionPoolStats,
}));

jest.unstable_mockModule("../services/StellarStreamService.js", () => ({
  default: { getStatus: mockGetStatus },
}));

const { default: healthRoutes } = await import("../routes/health.js");

function buildApp() {
  const app = express();
  app.use("/health", healthRoutes);
  return app;
}

const healthyDeps = () => ({
  healthy: true,
  database: { healthy: true, latencyMs: 3, message: "Database connection successful" },
  redis: { healthy: true, latencyMs: 1, message: "Redis connection successful" },
  stellar: { healthy: true, latencyMs: 10, message: "Stellar Horizon API is reachable" },
});

describe("Dependency-aware health routes (/api/health*)", () => {
  let app;

  beforeEach(() => {
    mockCheckAllDependencies.mockReset();
    app = buildApp();
  });

  describe("GET /health/live", () => {
    it("returns 200 without checking any dependency", async () => {
      const res = await request(app).get("/health/live");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("alive");
      expect(mockCheckAllDependencies).not.toHaveBeenCalled();
    });
  });

  describe("GET /health/ready", () => {
    it("returns 200 ready when database and Redis are both healthy", async () => {
      mockCheckAllDependencies.mockResolvedValue(healthyDeps());

      const res = await request(app).get("/health/ready");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
      expect(res.body.checks).toEqual({ database: "up", redis: "up" });
    });

    it("returns 503 not_ready when the database is down (simulated DB outage)", async () => {
      mockCheckAllDependencies.mockResolvedValue({
        ...healthyDeps(),
        healthy: false,
        database: { healthy: false, latencyMs: 5000, message: "connect ECONNREFUSED" },
      });

      const res = await request(app).get("/health/ready");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("not_ready");
      expect(res.body.checks.database).toBe("down");
      expect(res.body.checks.redis).toBe("up");
    });

    it("returns 503 not_ready when Redis is down (simulated Redis outage)", async () => {
      mockCheckAllDependencies.mockResolvedValue({
        ...healthyDeps(),
        healthy: false,
        redis: { healthy: false, latencyMs: 5000, message: "Redis is in fallback mode (not connected)" },
      });

      const res = await request(app).get("/health/ready");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("not_ready");
      expect(res.body.checks.redis).toBe("down");
    });

    it("returns 503 not_ready when the dependency check itself throws", async () => {
      mockCheckAllDependencies.mockRejectedValue(new Error("boom"));

      const res = await request(app).get("/health/ready");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("not_ready");
      expect(res.body.error).toBe("boom");
    });
  });

  describe("GET /health (comprehensive)", () => {
    it("returns 200 ok when all dependencies are healthy", async () => {
      mockCheckAllDependencies.mockResolvedValue(healthyDeps());

      const res = await request(app).get("/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.checks.database.status).toBe("up");
      expect(res.body.checks.redis.status).toBe("up");
      expect(res.body.checks.stellar.status).toBe("up");
    });

    it("returns 503 degraded when only one dependency is down", async () => {
      mockCheckAllDependencies.mockResolvedValue({
        ...healthyDeps(),
        healthy: false,
        redis: { healthy: false, latencyMs: 5000, message: "Redis is in fallback mode (not connected)" },
      });

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("degraded");
      expect(res.body.checks.redis.status).toBe("down");
      expect(res.body.checks.database.status).toBe("up");
    });

    it("returns 503 down when database, Redis, and Stellar are all down", async () => {
      mockCheckAllDependencies.mockResolvedValue({
        healthy: false,
        database: { healthy: false, latencyMs: 5000, message: "connect ECONNREFUSED" },
        redis: { healthy: false, latencyMs: 5000, message: "Redis is in fallback mode (not connected)" },
        stellar: { healthy: false, latencyMs: 5000, message: "Stellar Horizon API is unreachable" },
      });

      const res = await request(app).get("/health");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("down");
    });
  });
});
