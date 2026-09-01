import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

const mockGetStats = jest.fn();
const mockResetBreaker = jest.fn();
const mockAuditCreate = jest.fn();

jest.unstable_mockModule("../services/CircuitBreakerService.js", () => ({
  default: {
    getStats: mockGetStats,
    resetBreaker: mockResetBreaker,
    getBreaker: jest.fn(),
    fire: jest.fn(),
  },
}));

jest.unstable_mockModule("../models/AuditLog.js", () => ({
  default: { create: mockAuditCreate },
}));

// Recreate the real auth guard split (authenticate = 401 without credentials,
// requireAdmin = 403 for non-admins) so the route-level authorization is
// exercised without needing a JWT or a database.
jest.unstable_mockModule("../middleware/auth.js", () => ({
  authenticate: (req, res, next) => {
    if (!req.headers["x-role"]) {
      return res.status(401).json({ error: "Access token required" });
    }
    req.user = { id: 1, role: req.headers["x-role"] };
    next();
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  },
}));

// Never actually hit Redis in tests — just pass the request through to the
// controller. Keeping the real auditLog middleware means we can assert that
// successful resets are written to the audit log.
jest.unstable_mockModule("../middleware/rateLimiter.js", () => ({
  rateLimit: () => (req, res, next) => next(),
}));

const { default: router } = await import("../routes/circuitBreaker.js");

function buildApp(role) {
  const app = express();
  app.use(express.json());
  if (role) {
    app.use((req, res, next) => {
      req.headers["x-role"] = role;
      next();
    });
  }
  app.use("/circuit-breaker", router);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStats.mockReturnValue({});
  mockResetBreaker.mockReturnValue(false);
  // AuditLog.create must return a promise or the audit middleware's
  // `AuditLog.create(...).catch(...)` throws after the response is sent.
  mockAuditCreate.mockResolvedValue({ id: 1 });
});

describe("circuit-breaker endpoint authorization", () => {
  it("rejects unauthenticated stats requests with 401", async () => {
    const res = await request(buildApp(null)).get("/circuit-breaker/stats");
    expect(res.status).toBe(401);
    expect(mockGetStats).not.toHaveBeenCalled();
  });

  it("rejects non-admin stats requests with 403", async () => {
    const res = await request(buildApp("user")).get("/circuit-breaker/stats");
    expect(res.status).toBe(403);
    expect(mockGetStats).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated reset requests with 401", async () => {
    const res = await request(buildApp(null)).post("/circuit-breaker/reset/paystack");
    expect(res.status).toBe(401);
    expect(mockResetBreaker).not.toHaveBeenCalled();
  });

  it("rejects non-admin reset requests with 403", async () => {
    const res = await request(buildApp("user")).post("/circuit-breaker/reset/paystack");
    expect(res.status).toBe(403);
    expect(mockResetBreaker).not.toHaveBeenCalled();
  });

  it("allows an admin to read stats", async () => {
    mockGetStats.mockReturnValue({ paystack: { state: "CLOSED" } });
    const res = await request(buildApp("admin")).get("/circuit-breaker/stats");
    expect(res.status).toBe(200);
    expect(mockGetStats).toHaveBeenCalledTimes(1);
  });
});

describe("circuit-breaker reset behavior", () => {
  it("returns 404 for an unknown service key and does not attempt a reset", async () => {
    mockResetBreaker.mockReturnValue(false);
    const res = await request(buildApp("admin")).post("/circuit-breaker/reset/does-not-exist");
    expect(res.status).toBe(404);
    expect(mockResetBreaker).toHaveBeenCalledWith("does-not-exist");
    // The audit middleware records the rejected attempt with its outcome
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "circuit_breaker",
        resourceId: "does-not-exist",
        statusCode: 404,
      }),
    );
  });

  it("resets a known service and audit-logs the successful reset", async () => {
    mockResetBreaker.mockReturnValue(true);
    const res = await request(buildApp("admin")).post("/circuit-breaker/reset/paystack");
    expect(res.status).toBe(200);
    expect(mockResetBreaker).toHaveBeenCalledWith("paystack");
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "circuit_breaker",
        resourceId: "paystack",
        action: "CREATE",
        statusCode: 200,
      }),
    );
  });
});