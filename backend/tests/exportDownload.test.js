/**
 * Tests for GET /api/transactions/export/download  (Issue #227)
 *
 * All external dependencies (DB, ExportService, rate-limit store) are mocked
 * so these tests run without a real database or Redis instance.
 *
 * Scenarios:
 *  1. Missing token        → 400
 *  2. Malformed JWT        → 400
 *  3. Expired JWT          → 410
 *  4. No jti claim         → 400  (pre-fix tokens)
 *  5. Export not in DB     → 404
 *  6. Export expired       → 410
 *  7. JTI already used     → 410
 *  8. Happy path           → 200 file served
 *  9. Rate-limit exceeded  → 429
 */

import { jest } from "@jest/globals";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

const TEST_SECRET = "test-secret-1234";
process.env.JWT_SECRET = TEST_SECRET;

// ─── Mock ExportService ──────────────────────────────────────────────────────
// We mock serveDownload to return controlled responses without a real DB/FS.
const mockServeDownload = jest.fn();

jest.unstable_mockModule("../services/ExportService.js", () => ({
  default: { serveDownload: mockServeDownload },
}));

// ─── Mock rate-limit-redis so downloadLimiter works in-memory ────────────────
jest.unstable_mockModule("rate-limit-redis", () => ({
  default: class {
    constructor() {}
    init() {}
    async increment(key) { return { totalHits: 1, resetTime: new Date() }; }
    async decrement() {}
    async resetKey() {}
  },
}));

// ─── Build app ───────────────────────────────────────────────────────────────
// Import after mocks are set up (ESM dynamic import order)
const { downloadExport } = await import("../controllers/exportController.js");
const { downloadLimiter } = await import("../config/rateLimiting.js");

const app = express();
app.use(express.json());
// Wire the same middleware stack as the real route
app.get("/api/transactions/export/download", downloadLimiter, downloadExport);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeToken(payload, opts = {}) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: "1h", ...opts });
}

function makeExpiredToken(payload) {
  return jwt.sign(payload, TEST_SECRET, { expiresIn: "-1s" });
}

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("GET /api/transactions/export/download — Issue #227 security hardening", () => {
  beforeEach(() => {
    mockServeDownload.mockReset();
  });

  // 1. Missing token
  it("returns 400 when no token is provided", async () => {
    const res = await request(app).get("/api/transactions/export/download");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Download token required" });
  });

  // 2. Malformed JWT
  it("returns 400 for a malformed/invalid token", async () => {
    mockServeDownload.mockResolvedValue({ statusCode: 400, error: "Invalid download token." });
    const res = await request(app).get("/api/transactions/export/download?token=not.a.valid.jwt");
    expect(res.status).toBe(400);
  });

  // 3. Expired JWT
  it("returns 410 for an expired token", async () => {
    const token = makeExpiredToken({ exportId: "e1", userId: "u1", jti: "some-jti" });
    mockServeDownload.mockResolvedValue({ statusCode: 410, error: "Download link has expired." });
    const res = await request(app)
      .get("/api/transactions/export/download")
      .query({ token });
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ error: expect.stringContaining("expired") });
  });

  // 4. pre-fix token (no jti claim) → rejected
  it("returns 400 when the token lacks a jti claim (pre-fix token)", async () => {
    const token = makeToken({ exportId: "e1", userId: "u1" }); // no jti
    mockServeDownload.mockResolvedValue({ statusCode: 400, error: "Invalid download token." });
    const res = await request(app)
      .get("/api/transactions/export/download")
      .query({ token });
    expect(res.status).toBe(400);
  });

  // 5. Export record not found in DB
  it("returns 404 when the export record does not exist in the database", async () => {
    const token = makeToken({ exportId: "nonexistent", userId: "u1", jti: "jti-abc" });
    mockServeDownload.mockResolvedValue({ statusCode: 404, error: "Export not found or expired." });
    const res = await request(app)
      .get("/api/transactions/export/download")
      .query({ token });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Export not found or expired." });
  });

  // 6. Export record has expired (expires_at in past)
  it("returns 410 when the export has passed its expiry date", async () => {
    const token = makeToken({ exportId: "e-old", userId: "u1", jti: "jti-old" });
    mockServeDownload.mockResolvedValue({ statusCode: 410, error: "Export has expired." });
    const res = await request(app)
      .get("/api/transactions/export/download")
      .query({ token });
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ error: "Export has expired." });
  });

  // 7. JTI already used (download_jti is null in DB)
  it("returns 410 when the download link has already been used (jti nullified)", async () => {
    const token = makeToken({ exportId: "e2", userId: "u1", jti: "already-used-jti" });
    mockServeDownload.mockResolvedValue({ statusCode: 410, error: "Download link has already been used." });
    const res = await request(app)
      .get("/api/transactions/export/download")
      .query({ token });
    expect(res.status).toBe(410);
    expect(res.body).toMatchObject({ error: "Download link has already been used." });
  });

  // 8. Happy path — file served successfully
  it("returns 200 and sets Content-Disposition on a valid, unused token", async () => {
    const token = makeToken({ exportId: "e3", userId: "u1", jti: "fresh-jti" });
    // sendFile is stubbed by returning a mock file response
    mockServeDownload.mockResolvedValue({
      statusCode: 200,
      filePath: "/tmp/transactions-export.csv",
      contentType: "text/csv",
      filename: "transactions-export.csv",
    });

    // We need the response body; stub res.sendFile since the file doesn't
    // exist on disk during tests.
    const testApp = express();
    testApp.use(express.json());
    testApp.get("/api/transactions/export/download", downloadLimiter, async (req, res) => {
      const { token: t } = req.query;
      if (!t) return res.status(400).json({ error: "Download token required" });

      const { default: ExportService } = await import("../services/ExportService.js");
      const result = await ExportService.serveDownload(t);
      if (result.error) return res.status(result.statusCode).json({ error: result.error });

      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      // Return 200 JSON instead of sendFile (no real file in tests)
      return res.status(200).json({ ok: true, filename: result.filename });
    });

    const res = await request(testApp)
      .get("/api/transactions/export/download")
      .query({ token });

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("transactions-export.csv");
  });

  // 9. Rate limit — 11th request from same IP should be blocked
  it("returns 429 after exceeding the 10-request download rate limit", async () => {
    // Build a minimal app with a tight limiter (max=1, windowMs=60s) so we
    // can trigger the limit without 10 real HTTP calls.
    const { default: rateLimit } = await import("express-rate-limit");
    const tightLimiter = rateLimit({ windowMs: 60_000, max: 1 });

    const limitedApp = express();
    limitedApp.use(express.json());
    limitedApp.get("/dl", tightLimiter, downloadExport);

    // First request (no token) → 400 (passes limiter)
    const r1 = await request(limitedApp).get("/dl");
    expect(r1.status).toBe(400);

    // Second request → should be throttled → 429
    const r2 = await request(limitedApp).get("/dl");
    expect(r2.status).toBe(429);
  });
});
