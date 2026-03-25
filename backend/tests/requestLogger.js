import { jest } from "@jest/globals";
import { createRequire } from "module";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the modules under test
// ---------------------------------------------------------------------------

const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockChildLogger = {
  info: mockLoggerInfo,
  warn: mockLoggerWarn,
  error: mockLoggerError,
};

jest.mock("../../utils/logger.js", () => ({
  createRequestLogger: jest.fn(() => mockChildLogger),
  default: { child: jest.fn(() => mockChildLogger) },
  stream: { write: jest.fn() },
}));

import {
  requestLogger,
  sanitizeHeaders,
  sanitizeBody,
} from "../../middleware/requestLogger.js";

import { correlationId, CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from "../../middleware/correlationId.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(overrides = {}) {
  return {
    method: "GET",
    originalUrl: "/api/transactions",
    path: "/api/transactions",
    query: {},
    params: {},
    headers: {
      "user-agent": "jest-test/1.0",
      "content-type": "application/json",
    },
    body: {},
    ip: "127.0.0.1",
    socket: { remoteAddress: "127.0.0.1" },
    correlationId: "test-corr-id",
    requestId: "test-req-id",
    user: null,
    ...overrides,
  };
}

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader: jest.fn((key, value) => { headers[key] = value; }),
    getHeader: jest.fn((key) => headers[key] ?? null),
    end: jest.fn(),
    _headers: headers,
  };
  return res;
}

// ---------------------------------------------------------------------------
// correlationId middleware
// ---------------------------------------------------------------------------

describe("correlationId middleware", () => {
  it("generates correlationId and requestId when none provided", () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();
    const next = jest.fn();

    correlationId(req, res, next);

    expect(req.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("preserves a valid incoming correlationId", () => {
    const incoming = "550e8400-e29b-41d4-a716-446655440000";
    const req = makeReq({ headers: { [CORRELATION_ID_HEADER]: incoming } });
    const res = makeRes();

    correlationId(req, res, jest.fn());

    expect(req.correlationId).toBe(incoming);
  });

  it("replaces an invalid correlationId with a generated one", () => {
    const req = makeReq({ headers: { [CORRELATION_ID_HEADER]: "not-a-uuid" } });
    const res = makeRes();

    correlationId(req, res, jest.fn());

    expect(req.correlationId).not.toBe("not-a-uuid");
    expect(req.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it("sets correlation and request ID response headers", () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();

    correlationId(req, res, jest.fn());

    expect(res.setHeader).toHaveBeenCalledWith(CORRELATION_ID_HEADER, req.correlationId);
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
  });

  it("generates a different requestId on every call even with same correlationId", () => {
    const incoming = "550e8400-e29b-41d4-a716-446655440000";
    const reqA = makeReq({ headers: { [CORRELATION_ID_HEADER]: incoming } });
    const reqB = makeReq({ headers: { [CORRELATION_ID_HEADER]: incoming } });

    correlationId(reqA, makeRes(), jest.fn());
    correlationId(reqB, makeRes(), jest.fn());

    expect(reqA.requestId).not.toBe(reqB.requestId);
    expect(reqA.correlationId).toBe(reqB.correlationId);
  });
});

// ---------------------------------------------------------------------------
// sanitizeHeaders
// ---------------------------------------------------------------------------

describe("sanitizeHeaders", () => {
  it("redacts authorization header", () => {
    const result = sanitizeHeaders({ authorization: "Bearer secret-token", "content-type": "application/json" });
    expect(result.authorization).toBe("[REDACTED]");
    expect(result["content-type"]).toBe("application/json");
  });

  it("redacts cookie header", () => {
    const result = sanitizeHeaders({ cookie: "session=abc123" });
    expect(result.cookie).toBe("[REDACTED]");
  });

  it("redacts x-api-key header", () => {
    const result = sanitizeHeaders({ "x-api-key": "super-secret" });
    expect(result["x-api-key"]).toBe("[REDACTED]");
  });

  it("is case-insensitive for sensitive header names", () => {
    const result = sanitizeHeaders({ Authorization: "Bearer xyz" });
    expect(result.Authorization).toBe("[REDACTED]");
  });

  it("does not mutate the original headers object", () => {
    const original = { authorization: "Bearer token", host: "localhost" };
    sanitizeHeaders(original);
    expect(original.authorization).toBe("Bearer token");
  });

  it("passes through non-sensitive headers unchanged", () => {
    const result = sanitizeHeaders({ host: "api.tagged.xyz", "x-request-id": "abc" });
    expect(result.host).toBe("api.tagged.xyz");
    expect(result["x-request-id"]).toBe("abc");
  });
});

// ---------------------------------------------------------------------------
// sanitizeBody
// ---------------------------------------------------------------------------

describe("sanitizeBody", () => {
  it("redacts password field", () => {
    const result = sanitizeBody({ email: "user@example.com", password: "hunter2" });
    expect(result.password).toBe("[REDACTED]");
    expect(result.email).toBe("user@example.com");
  });

  it("redacts nested sensitive keys", () => {
    const result = sanitizeBody({ user: { password: "secret", name: "Alice" } });
    expect(result.user.password).toBe("[REDACTED]");
    expect(result.user.name).toBe("Alice");
  });

  it("redacts privateKey and secretKey", () => {
    const result = sanitizeBody({ privateKey: "0xPRIVATE", secretKey: "0xSECRET", amount: 100 });
    expect(result.privateKey).toBe("[REDACTED]");
    expect(result.secretKey).toBe("[REDACTED]");
    expect(result.amount).toBe(100);
  });

  it("does not mutate the original object", () => {
    const original = { password: "secret", amount: 50 };
    sanitizeBody(original);
    expect(original.password).toBe("secret");
  });

  it("handles null values without throwing", () => {
    expect(() => sanitizeBody(null)).not.toThrow();
    expect(() => sanitizeBody(undefined)).not.toThrow();
  });

  it("handles arrays at the top level without throwing", () => {
    expect(() => sanitizeBody([{ password: "x" }])).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// requestLogger middleware
// ---------------------------------------------------------------------------

describe("requestLogger middleware", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls next()", () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    requestLogger(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("logs REQUEST event on arrival", () => {
    const req = makeReq({ method: "POST", originalUrl: "/api/payments" });
    const res = makeRes();

    requestLogger(req, res, jest.fn());

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "REQUEST",
      expect.objectContaining({
        event: "request_received",
        method: "POST",
        url: "/api/payments",
      })
    );
  });

  it("logs RESPONSE event when res.end is called", () => {
    const req = makeReq();
    const res = makeRes();
    res.statusCode = 200;

    requestLogger(req, res, jest.fn());
    res.end();

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      "RESPONSE",
      expect.objectContaining({
        event: "request_completed",
        statusCode: 200,
      })
    );
  });

  it("logs at warn level for 4xx responses", () => {
    const req = makeReq();
    const res = makeRes();
    res.statusCode = 404;

    requestLogger(req, res, jest.fn());
    res.end();

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "RESPONSE",
      expect.objectContaining({ statusCode: 404 })
    );
  });

  it("logs at error level for 5xx responses", () => {
    const req = makeReq();
    const res = makeRes();
    res.statusCode = 500;

    requestLogger(req, res, jest.fn());
    res.end();

    expect(mockLoggerError).toHaveBeenCalledWith(
      "RESPONSE",
      expect.objectContaining({ statusCode: 500 })
    );
  });

  it("includes durationMs in the response log", () => {
    const req = makeReq();
    const res = makeRes();

    requestLogger(req, res, jest.fn());
    res.end();

    const call = mockLoggerInfo.mock.calls.find(([label]) => label === "RESPONSE");
    expect(call).toBeDefined();
    expect(typeof call[1].durationMs).toBe("number");
    expect(call[1].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("redacts sensitive headers before logging", () => {
    const req = makeReq({
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
    });
    const res = makeRes();

    requestLogger(req, res, jest.fn());

    const requestCall = mockLoggerInfo.mock.calls.find(([label]) => label === "REQUEST");
    expect(requestCall[1].headers.authorization).toBe("[REDACTED]");
    expect(requestCall[1].headers["content-type"]).toBe("application/json");
  });

  it("redacts sensitive body fields before logging", () => {
    const req = makeReq({
      method: "POST",
      body: { email: "user@example.com", password: "s3cr3t" },
    });
    const res = makeRes();

    requestLogger(req, res, jest.fn());

    const requestCall = mockLoggerInfo.mock.calls.find(([label]) => label === "REQUEST");
    expect(requestCall[1].body.password).toBe("[REDACTED]");
    expect(requestCall[1].body.email).toBe("user@example.com");
  });

  it("replaces oversized bodies with a placeholder", () => {
    const bigBody = { data: "x".repeat(3000) };
    const req = makeReq({ method: "POST", body: bigBody });
    const res = makeRes();

    requestLogger(req, res, jest.fn());

    const requestCall = mockLoggerInfo.mock.calls.find(([label]) => label === "REQUEST");
    expect(String(requestCall[1].body)).toMatch(/BODY_TOO_LARGE/);
  });

  it("includes userId from req.user when authenticated", () => {
    const req = makeReq({ user: { id: 42 } });
    const res = makeRes();

    const { createRequestLogger } = await import("../../utils/logger.js");

    requestLogger(req, res, jest.fn());

    expect(createRequestLogger).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42 })
    );
  });

  it("does not throw when req.body is empty", () => {
    const req = makeReq({ body: {} });
    const res = makeRes();

    expect(() => requestLogger(req, res, jest.fn())).not.toThrow();
  });

  it("restores the original res.end so subsequent calls work normally", () => {
    const req = makeReq();
    const res = makeRes();
    const originalEnd = res.end;

    requestLogger(req, res, jest.fn());
    res.end(); // first call — hooks the interceptor
    res.end(); // second call — should use the restored original

    // originalEnd should have been called twice total
    expect(originalEnd).toHaveBeenCalledTimes(2);
  });
});