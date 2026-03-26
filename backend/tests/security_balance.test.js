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
    } else {
      res.status(401).json({ error: "Invalid token" });
    }
  },
}));

jest.unstable_mockModule("../models/index.js", () => ({
  User: { findById: jest.fn() },
  Balance: {
    getByUser: jest.fn().mockResolvedValue([
      { token_symbol: "USDT", amount: "100.00", usd_value: "100.00" },
    ]),
  },
  Token: { getAll: jest.fn() },
}));

// Now import the router and controller
const { default: balancesRouter } = await import("../routes/balances.js");

const app = express();
app.use(express.json());
app.use("/api/balances", balancesRouter);

describe("Security: Balance Lookup by Tag", () => {
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
