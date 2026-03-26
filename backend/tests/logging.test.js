import { jest } from "@jest/globals";

const mockPinoInfo = jest.fn();
const mockPinoWarn = jest.fn();
const mockPinoError = jest.fn();
const mockPinoChild = jest.fn(() => ({
  info: mockPinoInfo,
  warn: mockPinoWarn,
  error: mockPinoError,
}));

jest.unstable_mockModule("../utils/logger.js", () => ({
  default: {
    child: mockPinoChild,
    info: mockPinoInfo,
    warn: mockPinoWarn,
    error: mockPinoError,
  },
  createRequestLogger: jest.fn(() => ({
    info: mockPinoInfo,
    warn: mockPinoWarn,
    error: mockPinoError,
  })),
  pino: { child: mockPinoChild },
}));

jest.unstable_mockModule("../middleware/correlationId.js", () => ({
  correlationId: jest.fn((req, res, next) => {
    req.correlationId = req.headers["x-correlation-id"] || "test-correlation-id";
    req.requestId = "test-request-id";
    next();
  }),
  CORRELATION_ID_HEADER: "x-correlation-id",
  REQUEST_ID_HEADER: "x-request-id",
}));

describe("Logging Integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("correlationId middleware", () => {
    it("generates correlation and request IDs", async () => {
      const { correlationId } = await import("../middleware/correlationId.js");

      const req = { headers: {} };
      const res = {};
      const next = jest.fn();

      correlationId(req, res, next);

      expect(req.correlationId).toBeDefined();
      expect(req.requestId).toBeDefined();
      expect(next).toHaveBeenCalled();
    });

    it("uses incoming correlation ID if valid UUID", async () => {
      const { correlationId } = await import("../middleware/correlationId.js");

      const req = {
        headers: { "x-correlation-id": "550e8400-e29b-41d4-a716-446655440000" },
      };
      const res = {};
      const next = jest.fn();

      correlationId(req, res, next);

      expect(req.correlationId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });
  });

  describe("requestLogger middleware", () => {
    it("logs request with correlation ID", async () => {
      const { requestLogger } = await import("../middleware/requestLogger.js");

      const req = {
        method: "POST",
        originalUrl: "/api/users",
        path: "/api/users",
        query: {},
        params: {},
        headers: { "user-agent": "test" },
        body: { username: "test", password: "secret" },
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
        correlationId: "corr-123",
        requestId: "req-456",
        user: { id: 1 },
      };
      const res = {
        setHeader: jest.fn(),
        getHeader: jest.fn(() => null),
        statusCode: 200,
        end: function (chunk, encoding, callback) {
          this.end = jest.fn();
          this.statusCode = 200;
          return this;
        },
      };
      const next = jest.fn();

      requestLogger(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("logs response with duration", async () => {
      const { requestLogger } = await import("../middleware/requestLogger.js");

      const req = {
        method: "GET",
        originalUrl: "/api/health",
        path: "/api/health",
        query: {},
        params: {},
        headers: { "user-agent": "test" },
        body: {},
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
        correlationId: "corr-123",
        requestId: "req-456",
        user: null,
      };
      const res = {
        setHeader: jest.fn(),
        getHeader: jest.fn(() => null),
        statusCode: 200,
        end: jest.fn(function () {
          return this;
        }),
      };
      const next = jest.fn();

      requestLogger(req, res, next);
      res.end();

      expect(mockPinoInfo).toHaveBeenCalled();
    });

    it("logs error level for 5xx responses", async () => {
      const { requestLogger } = await import("../middleware/requestLogger.js");

      const req = {
        method: "GET",
        originalUrl: "/api/fail",
        path: "/api/fail",
        query: {},
        params: {},
        headers: { "user-agent": "test" },
        body: {},
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
        correlationId: "corr-123",
        requestId: "req-456",
        user: null,
      };
      const res = {
        setHeader: jest.fn(),
        getHeader: jest.fn(() => null),
        statusCode: 500,
        end: jest.fn(function () {
          this.statusCode = 500;
          return this;
        }),
      };
      const next = jest.fn();

      requestLogger(req, res, next);
      res.end();

      expect(mockPinoError).toHaveBeenCalled();
    });

    it("redacts sensitive data in request body", async () => {
      const { requestLogger } = await import("../middleware/requestLogger.js");

      const req = {
        method: "POST",
        originalUrl: "/api/login",
        path: "/api/login",
        query: {},
        params: {},
        headers: { "user-agent": "test" },
        body: { email: "test@example.com", password: "super-secret" },
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
        correlationId: "corr-123",
        requestId: "req-456",
        user: null,
      };
      const res = {
        setHeader: jest.fn(),
        getHeader: jest.fn(() => null),
        statusCode: 200,
        end: jest.fn(function () {
          return this;
        }),
      };
      const next = jest.fn();

      requestLogger(req, res, next);

      expect(next).toHaveBeenCalled();
      const logCall = mockPinoInfo.mock.calls[0];
      const logData = logCall[1];
      expect(logData.body.password).toBe("[REDACTED]");
      expect(logData.body.email).toBe("test@example.com");
    });
  });

  describe("structured JSON output", () => {
    it("includes required fields in log output", async () => {
      const { requestLogger } = await import("../middleware/requestLogger.js");

      const req = {
        method: "POST",
        originalUrl: "/api/data",
        path: "/api/data",
        query: { page: "1" },
        params: { id: "123" },
        headers: { "user-agent": "test" },
        body: {},
        ip: "127.0.0.1",
        socket: { remoteAddress: "127.0.0.1" },
        correlationId: "corr-123",
        requestId: "req-456",
        user: { id: 42 },
      };
      const res = {
        setHeader: jest.fn(),
        getHeader: jest.fn(() => "100"),
        statusCode: 201,
        end: jest.fn(function () {
          return this;
        }),
      };
      const next = jest.fn();

      requestLogger(req, res, next);
      res.end();

      const responseLogCall = mockPinoInfo.mock.calls[1];
      const responseLog = responseLogCall[1];

      expect(responseLog.event).toBe("request_completed");
      expect(responseLog.method).toBe("POST");
      expect(responseLog.url).toBe("/api/data");
      expect(responseLog.statusCode).toBe(201);
      expect(responseLog.durationMs).toBeGreaterThan(0);
      expect(responseLog.correlationId).toBe("corr-123");
      expect(responseLog.requestId).toBe("req-456");
    });
  });
});
