import request from "supertest";
import express from "express";
import { jest } from "@jest/globals";

// Mocking dependencies before importing the router/controller
jest.unstable_mockModule("../config/database.js", () => ({
  default: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue({ id: "user-123", tag: "victim" }),
  })),
}));

jest.unstable_mockModule("../config/redis.js", () => ({
  default: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
  },
}));

jest.unstable_mockModule("../middleware/auth.js", () => ({
  authenticate: (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Access token required" });
    if (token === "valid-token-alice") {
      req.user = { id: "user-alice", tag: "alice" };
      next();
    } else if (token === "valid-token-bob") {
      req.user = { id: "user-bob", tag: "bob" };
      next();
    } else if (token === "valid-token-admin") {
      req.user = { id: "user-admin", tag: "admin", role: "admin" };
      next();
    } else {
      res.status(401).json({ error: "Invalid token" });
    }
  },
  requireAdmin: (req, res, next) => {
    if (req.user?.role !== "admin" && req.user?.role !== "super_admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  },
}));

jest.unstable_mockModule("../models/index.js", () => ({
  User: { findById: jest.fn().mockResolvedValue({ id: "user-alice", tag: "alice" }) },
  Balance: {
    findByUserId: jest.fn().mockResolvedValue([]),
    getByUser: jest.fn().mockResolvedValue([
      { token_symbol: "USDT", amount: "100.00", usd_value: "100.00" },
    ]),
    getAll: jest.fn().mockResolvedValue([
      {
        id: 1,
        user_id: "user-alice",
        token_symbol: "USDT",
        amount: "100.00",
        usd_value: "100.00",
        address: "0xabc",
        user_email: "alice@example.com",
        token_price: "1.00",
        token_chain: "evm",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    ]),
    countAll: jest.fn().mockResolvedValue(1),
  },
  Token: { getAll: jest.fn() },
}));

// Now import the router and controller
const { default: balancesRouter } = await import("../routes/balances.js");

const app = express();
app.use(express.json());
app.use("/api/balances", balancesRouter);

describe("Security: Balance Lookup by Tag", () => {
  it("registers exactly one validated handler for each balance detail method", () => {
    const detailRoutes = balancesRouter.stack
      .filter((layer) => layer.route?.path === "/:id")
      .map((layer) => Object.keys(layer.route.methods)[0]);

    expect(detailRoutes.sort()).toEqual(["delete", "get", "put"]);
  });

  it("rejects invalid balance IDs before the controller", async () => {
    const res = await request(app)
      .get("/api/balances/not-a-number")
      .set("Authorization", "Bearer valid-token-alice");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("VALIDATION_ERROR");
  });

  it("requires POST and makes duplicate sync requests converge", async () => {
    const first = await request(app)
      .post("/api/balances/sync")
      .set("Authorization", "Bearer valid-token-alice");
    const second = await request(app)
      .post("/api/balances/sync")
      .set("Authorization", "Bearer valid-token-alice");
    const legacy = await request(app)
      .get("/api/balances/sync")
      .set("Authorization", "Bearer valid-token-alice");

    expect(first.status).toBe(200);
    expect(second.status).toBe(first.status);
    expect(second.body).toEqual(first.body);
    expect(legacy.status).toBe(400);
  });

  it("should block unauthenticated access (401)", async () => {
    const res = await request(app).get("/api/balances/tag/alice");
    expect(res.status).toBe(401);
  });

  it("should block access to another user's balance (403)", async () => {
    // Authenticated as Bob, trying to access Alice's tag
    const res = await request(app)
      .get("/api/balances/tag/alice")
      .set("Authorization", "Bearer valid-token-bob");

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("You can only view your own balances");
  });

  it("should allow access to own balance (200)", async () => {
    // Authenticated as Alice, accessing Alice's tag
    const res = await request(app)
      .get("/api/balances/tag/alice")
      .set("Authorization", "Bearer valid-token-alice");

    expect(res.status).toBe(200);
    expect(res.body.tag).toBe("alice");
  });
});

describe("Security: GET /api/balances/all (admin only)", () => {
  it("should block unauthenticated access (401)", async () => {
    const res = await request(app).get("/api/balances/all");
    expect(res.status).toBe(401);
  });

  it("should block a signed-in non-admin user (403)", async () => {
    const res = await request(app)
      .get("/api/balances/all")
      .set("Authorization", "Bearer valid-token-alice");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Admin access required");
  });

  it("should return a minimal paginated projection for an admin (200)", async () => {
    const res = await request(app)
      .get("/api/balances/all?page=1&limit=10")
      .set("Authorization", "Bearer valid-token-admin");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual({
      id: 1,
      user_id: "user-alice",
      token_symbol: "USDT",
      amount: "100.00",
      usd_value: "100.00",
      address: "0xabc",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    });
    // Sensitive/verbose fields must not leak in the projection
    expect(res.body.data[0].user_email).toBeUndefined();
    expect(res.body.data[0].token_price).toBeUndefined();
    expect(res.body.data[0].token_chain).toBeUndefined();
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 10,
      offset: 0,
      total: 1,
      hasMore: false,
    });
  });
});
