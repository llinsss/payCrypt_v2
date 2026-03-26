import { jest } from "@jest/globals";

describe("Redactor", () => {
  let redactor;

  beforeEach(() => {
    jest.resetModules();
  });

  describe("sanitizeHeaders", () => {
    it("redacts sensitive headers", async () => {
      const { sanitizeHeaders } = await import("../utils/redactor.js");

      const headers = {
        "content-type": "application/json",
        authorization: "Bearer secret-token",
        cookie: "session=abc123",
        "x-api-key": "my-secret-key",
      };

      const result = sanitizeHeaders(headers);

      expect(result["content-type"]).toBe("application/json");
      expect(result.authorization).toBe("[REDACTED]");
      expect(result.cookie).toBe("[REDACTED]");
      expect(result["x-api-key"]).toBe("[REDACTED]");
    });

    it("handles empty headers", async () => {
      const { sanitizeHeaders } = await import("../utils/redactor.js");
      expect(sanitizeHeaders({})).toEqual({});
      expect(sanitizeHeaders(null)).toEqual({});
      expect(sanitizeHeaders(undefined)).toEqual({});
    });
  });

  describe("sanitizeBody", () => {
    it("redacts sensitive body fields", async () => {
      const { sanitizeBody } = await import("../utils/redactor.js");

      const body = {
        username: "john",
        password: "secret123",
        token: "jwt-token",
        data: { secretKey: "private" },
      };

      const result = sanitizeBody(body);

      expect(result.username).toBe("john");
      expect(result.password).toBe("[REDACTED]");
      expect(result.token).toBe("[REDACTED]");
      expect(result.data.secretKey).toBe("[REDACTED]");
    });

    it("handles nested objects", async () => {
      const { sanitizeBody } = await import("../utils/redactor.js");

      const body = {
        user: {
          password: "secret",
          profile: { ssn: "123-45-6789" },
        },
      };

      const result = sanitizeBody(body);

      expect(result.user.password).toBe("[REDACTED]");
      expect(result.user.profile.ssn).toBe("[REDACTED]");
    });

    it("returns primitives as-is", async () => {
      const { sanitizeBody } = await import("../utils/redactor.js");

      expect(sanitizeBody("string")).toBe("string");
      expect(sanitizeBody(123)).toBe(123);
      expect(sanitizeBody(null)).toBe(null);
      expect(sanitizeBody(undefined)).toBe(undefined);
    });

    it("handles arrays without recursing", async () => {
      const { sanitizeBody } = await import("../utils/redactor.js");

      const body = { items: [{ password: "secret" }] };
      const result = sanitizeBody(body);

      expect(result.items).toEqual([{ password: "secret" }]);
    });

    it("respects max depth", async () => {
      const { sanitizeBody } = await import("../utils/redactor.js");

      const deep = { a: { b: { c: { d: { e: "secret" } } } } };
      const result = sanitizeBody(deep, 4);

      expect(result.a.b.c.d.e).toBe("secret");
    });
  });

  describe("resolveBodyForLog", () => {
    it("returns undefined for empty body", async () => {
      const { resolveBodyForLog } = await import("../utils/redactor.js");

      expect(resolveBodyForLog({ body: {} })).toBeUndefined();
      expect(resolveBodyForLog({ body: null })).toBeUndefined();
      expect(resolveBodyForLog({ body: undefined })).toBeUndefined();
    });

    it("returns redacted body within size limit", async () => {
      const { resolveBodyForLog } = await import("../utils/redactor.js");

      const req = { body: { password: "secret", data: "valid" } };
      const result = resolveBodyForLog(req);

      expect(result.password).toBe("[REDACTED]");
      expect(result.data).toBe("valid");
    });
  });
});
