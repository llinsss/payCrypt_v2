import { describe, expect, it, jest, beforeAll, afterAll } from "@jest/globals";
import { sanitizeBody } from "../utils/redactor.js";

describe("Sentry request context placement and redaction", () => {
  describe("sanitizeBody strips secrets before Sentry context", () => {
    it("redacts password fields", () => {
      const body = { email: "user@test.com", password: "secret123" };
      const result = sanitizeBody(body);
      expect(result.email).toBe("user@test.com");
      expect(result.password).toBe("[REDACTED]");
    });

    it("redacts token fields", () => {
      const body = { refreshToken: "abc123", data: "safe" };
      const result = sanitizeBody(body);
      expect(result.refreshToken).toBe("[REDACTED]");
      expect(result.data).toBe("safe");
    });

    it("redacts nested secret fields", () => {
      const body = {
        user: { name: "Alice", apiKey: "sk-123" },
      };
      const result = sanitizeBody(body);
      expect(result.user.name).toBe("Alice");
      expect(result.user.apiKey).toBe("[REDACTED]");
    });

    it("redacts authorization and cookie headers", () => {
      const body = {
        authorization: "Bearer jwt-token",
        cookie: "session=abc",
        amount: 100,
      };
      const result = sanitizeBody(body);
      expect(result.authorization).toBe("[REDACTED]");
      expect(result.cookie).toBe("[REDACTED]");
      expect(result.amount).toBe(100);
    });

    it("handles empty and null bodies gracefully", () => {
      expect(sanitizeBody(null)).toBeNull();
      expect(sanitizeBody(undefined)).toBeUndefined();
      expect(sanitizeBody({})).toEqual({});
    });
  });

  describe("Sentry middleware placement in app.js", () => {
    it("Sentry context middleware appears AFTER body parsing in source", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync(
        new URL("../app.js", import.meta.url),
        "utf8",
      );

      const bodyParserIndex = source.indexOf("applyPayloadLimits(app)");
      const sentryContextIndex = source.indexOf("withIsolationScope");

      expect(bodyParserIndex).toBeGreaterThan(-1);
      expect(sentryContextIndex).toBeGreaterThan(-1);
      expect(sentryContextIndex).toBeGreaterThan(bodyParserIndex);
    });

    it("Sentry context middleware uses isolation scope", async () => {
      const fs = await import("node:fs");
      const source = fs.readFileSync(
        new URL("../app.js", import.meta.url),
        "utf8",
      );

      expect(source).toContain("withIsolationScope");
      expect(source).toContain("sanitizeSensitiveBody(req.body");
      expect(source).toContain("sanitizeSensitiveBody(req.query");
    });
  });
});
