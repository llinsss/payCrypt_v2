import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import express from "express";
import request from "supertest";

/**
 * Regression coverage for #552 — token catalog mutations must require an
 * authenticated admin while reads stay public.
 *
 * The auth middleware and cache control are mocked to faithfully mirror the
 * real middleware behavior (requireAdmin checks `req.user.role`), so we can
 * exercise the actual route wiring without a database.
 */

const mockCreateToken = jest.fn();
const mockGetTokens = jest.fn();
const mockGetTokenById = jest.fn();
const mockUpdateToken = jest.fn();
const mockDeleteToken = jest.fn();

jest.unstable_mockModule("../middleware/auth.js", () => ({
  authenticate: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Access token required" });
    }
    next();
  },
  requireAdmin: (req, res, next) => {
    if (!["admin", "super_admin"].includes(req.user?.role)) {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  },
}));

jest.unstable_mockModule("../middleware/cacheControl.js", () => ({
  publicCache: () => (_req, _res, next) => next(),
}));

jest.unstable_mockModule("../controllers/tokenController.js", () => ({
  createToken: mockCreateToken,
  getTokens: mockGetTokens,
  getTokenById: mockGetTokenById,
  updateToken: mockUpdateToken,
  deleteToken: mockDeleteToken,
}));

const tokenRoutes = (await import("../routes/tokens.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/tokens", tokenRoutes);
  return app;
}

const happyPaths = { status: 200, json: jest.fn() };
const createdPath = { status: 201, json: jest.fn() };
function mockControllersHappy() {
  mockCreateToken.mockImplementation(async (_req, res) => {
    res.status(201).json(createdPath.json());
  });
  mockGetTokens.mockImplementation(async (_req, res) => res.json(happyPaths.json()));
  mockGetTokenById.mockImplementation(async (_req, res) => res.json(happyPaths.json()));
  mockUpdateToken.mockImplementation(async (_req, res) => res.json(happyPaths.json()));
  mockDeleteToken.mockImplementation(async (_req, res) => res.json(happyPaths.json()));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockControllersHappy();
});

describe("token catalog mutations require an authenticated admin", () => {
  describe.each([
    ["POST /tokens", "post", "/tokens"],
    ["PUT /tokens/:id", "put", "/tokens/1"],
    ["DELETE /tokens/:id", "delete", "/tokens/1"],
  ])("%s", (_label, method, path) => {
    it("rejects anonymous callers with 401", async () => {
      const res = await request(buildApp())[method](path).send({ symbol: "BTC" });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Access token required");
    });

    it("rejects non-admin authenticated users with 403", async () => {
      // Build the app with a wrapper that sets an authenticated non-admin user
      // before the router sees the request.
      const chained = express();
      chained.use(express.json());
      chained.use((req, _res, next) => {
        req.user = { id: 1, role: "user" };
        next();
      });
      chained.use("/tokens", tokenRoutes);

      const res = await request(chained)[method](path).send({ symbol: "BTC" });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("Admin access required");
    });

    it("allows authenticated admin users through to the controller", async () => {
      const chained = express();
      chained.use(express.json());
      chained.use((req, _res, next) => {
        req.user = { id: 9, role: "admin" };
        next();
      });
      chained.use("/tokens", tokenRoutes);

      const res = await request(chained)[method](path).send({ symbol: "BTC" });

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });

    it("allows super_admin users through to the controller", async () => {
      const chained = express();
      chained.use(express.json());
      chained.use((req, _res, next) => {
        req.user = { id: 10, role: "super_admin" };
        next();
      });
      chained.use("/tokens", tokenRoutes);

      const res = await request(chained)[method](path).send({ symbol: "BTC" });

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });
});

describe("token catalog reads remain public", () => {
  it("serves GET /tokens without authentication", async () => {
    const res = await request(buildApp()).get("/tokens");

    expect(res.status).toBe(200);
  });

  it("serves GET /tokens/:id without authentication", async () => {
    const res = await request(buildApp()).get("/tokens/1");

    expect(res.status).toBe(200);
  });
});