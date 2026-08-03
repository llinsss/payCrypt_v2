import { jest } from "@jest/globals";
import express from "express";
import compression from "compression";
import request from "supertest";

import {
  PAYLOAD_LIMITS,
  applyPayloadLimits,
  limitForPath,
  payloadTooLargeHandler,
} from "../middleware/payloadLimits.js";

/**
 * Build an app wired exactly like backend/app.js, but without the database,
 * queue and Sentry boot that importing the real app would drag in.
 */
function buildApp() {
  const app = express();

  applyPayloadLimits(app);

  app.post("/api/auth/login", (req, res) => res.json({ ok: true }));
  app.post("/api/kycs/upload", (req, res) => res.json({ ok: true }));
  app.post("/api/transactions", (req, res) => res.json({ ok: true }));
  app.get("/api/big", (_req, res) =>
    // Comfortably over the 1kb compression threshold.
    res.json({ rows: Array.from({ length: 500 }, (_, i) => ({ i, note: "payload" })) }),
  );

  app.use(payloadTooLargeHandler);
  return app;
}

/** A JSON body of approximately `kb` kilobytes. */
const bodyOfSize = (kb) => ({ blob: "x".repeat(kb * 1024) });

describe("payload size limits", () => {
  const app = buildApp();

  describe("default tier (50kb)", () => {
    it("accepts a body under the limit", async () => {
      const res = await request(app).post("/api/transactions").send(bodyOfSize(10));
      expect(res.status).toBe(200);
    });

    it("rejects a body over the limit with 413", async () => {
      const res = await request(app).post("/api/transactions").send(bodyOfSize(80));
      expect(res.status).toBe(413);
    });
  });

  describe("auth tier (10kb)", () => {
    it("accepts a small credential body", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "a@b.co", password: "hunter2" });
      expect(res.status).toBe(200);
    });

    it("rejects a body that the default tier would have allowed", async () => {
      // 30kb is under the 50kb default but over the 10kb auth limit, so this
      // asserts the auth tier is actually applied rather than the global one.
      const res = await request(app).post("/api/auth/login").send(bodyOfSize(30));
      expect(res.status).toBe(413);
    });
  });

  describe("upload tier (10mb)", () => {
    it("accepts a body far larger than the default tier allows", async () => {
      const res = await request(app).post("/api/kycs/upload").send(bodyOfSize(200));
      expect(res.status).toBe(200);
    });
  });

  describe("413 response body", () => {
    it("describes the limit that was exceeded", async () => {
      const res = await request(app).post("/api/transactions").send(bodyOfSize(80));

      expect(res.status).toBe(413);
      expect(res.body.error).toBe("Payload Too Large");
      expect(res.body.limit).toBe(PAYLOAD_LIMITS.default);
      expect(res.body.message).toMatch(/exceeds the 50kb limit/);
    });

    it("reports the auth limit on auth routes", async () => {
      const res = await request(app).post("/api/auth/login").send(bodyOfSize(30));

      expect(res.status).toBe(413);
      expect(res.body.limit).toBe(PAYLOAD_LIMITS.auth);
      expect(res.body.message).toMatch(/10kb/);
    });
  });

  describe("limitForPath", () => {
    it("maps each route class to its tier", () => {
      expect(limitForPath("/api/auth/login")).toBe(PAYLOAD_LIMITS.auth);
      expect(limitForPath("/api/kycs/upload")).toBe(PAYLOAD_LIMITS.upload);
      expect(limitForPath("/api/transactions")).toBe(PAYLOAD_LIMITS.default);
      expect(limitForPath("")).toBe(PAYLOAD_LIMITS.default);
    });
  });

  describe("payloadTooLargeHandler", () => {
    it("passes unrelated errors along untouched", () => {
      const next = jest.fn();
      const err = new Error("something else");

      payloadTooLargeHandler(err, { path: "/api/x", headers: {} }, {}, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});

describe("response compression", () => {
  // Mirrors the configuration in backend/app.js.
  const app = express();
  app.use(
    compression({
      filter: (req, res) => {
        if (req.headers["x-no-compression"]) return false;
        return compression.filter(req, res);
      },
      threshold: 1024,
      level: 6,
    }),
  );
  app.get("/api/big", (_req, res) =>
    res.json({ rows: Array.from({ length: 500 }, (_, i) => ({ i, note: "payload" })) }),
  );
  app.get("/api/small", (_req, res) => res.json({ ok: true }));

  it("gzips JSON responses over the 1kb threshold", async () => {
    const res = await request(app).get("/api/big").set("Accept-Encoding", "gzip");
    expect(res.headers["content-encoding"]).toBe("gzip");
  });

  it("leaves responses under the threshold uncompressed", async () => {
    const res = await request(app).get("/api/small").set("Accept-Encoding", "gzip");
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("honours the x-no-compression opt-out", async () => {
    const res = await request(app)
      .get("/api/big")
      .set("Accept-Encoding", "gzip")
      .set("x-no-compression", "1");
    expect(res.headers["content-encoding"]).toBeUndefined();
  });

  it("serves brotli when the client prefers it", async () => {
    // compression@1.8 supports br and prefers it over gzip when both are offered.
    const res = await request(app).get("/api/big").set("Accept-Encoding", "br, gzip");
    expect(res.headers["content-encoding"]).toBe("br");
  });

  it("falls back to gzip for clients that do not accept brotli", async () => {
    const res = await request(app).get("/api/big").set("Accept-Encoding", "gzip");
    expect(res.headers["content-encoding"]).toBe("gzip");
  });

  it("does not corrupt the payload it compresses", async () => {
    const res = await request(app).get("/api/big").set("Accept-Encoding", "gzip");
    expect(res.body.rows).toHaveLength(500);
    expect(res.body.rows[499]).toEqual({ i: 499, note: "payload" });
  });
});
