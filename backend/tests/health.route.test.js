/**
 * Regression tests for issue #567: the root `GET /health` endpoint must be a
 * pure liveness probe — always 200 while the process is up, and never
 * dependent on the database, Redis, or any other downstream system.
 *
 * `../utils/dbHealth.js` and `../services/StellarStreamService.js` are
 * mocked so the assertion "liveness never touches dependency checks" can be
 * made directly (via `expect(mockCheckAllDependencies).not.toHaveBeenCalled()`)
 * instead of relying on a real database/Redis connection outcome.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import request from "supertest";

const mockCheckAllDependencies = jest.fn();
const mockGetConnectionPoolStats = jest.fn(() => ({ used: 1, free: 9, max: 10 }));
const mockGetStatus = jest.fn(() => ({ connected: true }));

jest.unstable_mockModule("../utils/dbHealth.js", () => ({
  checkAllDependencies: mockCheckAllDependencies,
  getConnectionPoolStats: mockGetConnectionPoolStats,
}));

jest.unstable_mockModule("../services/StellarStreamService.js", () => ({
  default: { getStatus: mockGetStatus },
}));

const { default: app } = await import("../app.js");

describe("GET /health (root liveness probe)", () => {
  beforeEach(() => {
    mockCheckAllDependencies.mockReset();
  });

  it("returns 200 with a liveness payload — not the old dumb {status:'ok'} shape", async () => {
    mockCheckAllDependencies.mockResolvedValue({
      healthy: true,
      database: { healthy: true },
      redis: { healthy: true },
      stellar: { healthy: true },
    });

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("alive");
    expect(res.body).toHaveProperty("uptime");
    expect(res.body).toHaveProperty("pid");
    expect(res.body).toHaveProperty("memoryUsage");
    // The old duplicate handler in routes/general.js returned
    // { status: "OK", environment: "anon" } — that shape must be gone.
    expect(res.body.environment).toBeUndefined();
    // Liveness reports no per-dependency detail; that belongs to
    // /api/health and /api/health/ready.
    expect(res.body.checks).toBeUndefined();
  });

  it("stays 200 even when the database and Redis are both down (liveness is dependency-free)", async () => {
    mockCheckAllDependencies.mockRejectedValue(
      new Error("simulated total dependency outage"),
    );

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("alive");
    // The whole point of the liveness/readiness split: liveness must never
    // even consult dependency health.
    expect(mockCheckAllDependencies).not.toHaveBeenCalled();
  });
});
