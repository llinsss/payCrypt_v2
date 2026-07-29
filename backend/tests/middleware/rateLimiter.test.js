import { jest } from "@jest/globals";
import rateLimit, { strictAuthRateLimit, AUTH_RATE_LIMITS } from "../../middleware/rateLimiter.js";
import RateLimitService from "../../services/RateLimitService.js";
import AuditLog from "../../models/AuditLog.js";
import * as Sentry from "@sentry/node";

jest.mock("../../services/RateLimitService.js");
jest.mock("../../models/AuditLog.js");
jest.mock("../../models/User.js");
jest.mock("@sentry/node");

describe("RateLimiter Middleware", () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      ip: "127.0.0.1",
      user: null,
      originalUrl: "/test",
    };
    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should allow request if tokens are available", async () => {
    RateLimitService.consume.mockResolvedValue({ allowed: true, remaining: 9 });
    RateLimitService.getTierLimits.mockReturnValue({ capacity: 10, refillRatePerMs: 0.01 });

    const middleware = rateLimit({ endpointName: "api", max: 10, windowMs: 1000 });
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", "10");
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 9);
  });

  it("should block request if tokens are exhausted and log violation", async () => {
    RateLimitService.consume.mockResolvedValue({ allowed: false, remaining: 0 });
    RateLimitService.getTierLimits.mockReturnValue({ capacity: 10, refillRatePerMs: 0.01 });

    const middleware = rateLimit({ endpointName: "api", max: 10, windowMs: 1000 });
    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(AuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      action: "rate_limit_exceeded"
    }));
  });

  it("should bypass rate limiting for whitelisted IPs", async () => {
    process.env.IP_WHITELIST = "127.0.0.1, 192.168.1.1";
    
    RateLimitService.consume.mockClear();
    const middleware = rateLimit({ endpointName: "api" });
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(RateLimitService.consume).not.toHaveBeenCalled();
  });

  it("should report exceeded limits to Sentry with the endpoint and IP", async () => {
    RateLimitService.consume.mockResolvedValue({ allowed: false, remaining: 0 });
    RateLimitService.getTierLimits.mockReturnValue({ capacity: 5, refillRatePerMs: 0.01 });

    const middleware = rateLimit({ endpointName: "login", max: 5, windowMs: 900000 });
    await middleware(req, res, next);

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("login"),
      expect.objectContaining({
        level: "warning",
        tags: expect.objectContaining({ endpointName: "login", ip: "127.0.0.1" }),
      })
    );
  });

  it("should include a Retry-After header when blocked", async () => {
    RateLimitService.consume.mockResolvedValue({ allowed: false, remaining: 0 });
    RateLimitService.getTierLimits.mockReturnValue({ capacity: 5, refillRatePerMs: 0.01 });

    const middleware = rateLimit({ endpointName: "login", max: 5, windowMs: 900000 });
    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(Number));
  });
});

describe("strictAuthRateLimit presets", () => {
  it("defines strict per-IP limits for the sensitive auth endpoints", () => {
    expect(AUTH_RATE_LIMITS.login).toEqual({ endpointName: "login", windowMs: 15 * 60 * 1000, max: 5 });
    expect(AUTH_RATE_LIMITS.forgotPassword).toEqual({ endpointName: "forgot-password", windowMs: 60 * 60 * 1000, max: 3 });
    expect(AUTH_RATE_LIMITS.resetPassword).toEqual({ endpointName: "reset-password", windowMs: 60 * 60 * 1000, max: 3 });
    expect(AUTH_RATE_LIMITS.twoFactorVerify).toEqual({ endpointName: "2fa-verify", windowMs: 15 * 60 * 1000, max: 5 });
  });

  it("builds a working middleware for a known preset", async () => {
    RateLimitService.consume.mockResolvedValue({ allowed: true, remaining: 4 });
    RateLimitService.getTierLimits.mockReturnValue({ capacity: 5, refillRatePerMs: 0.01 });

    const req = { ip: "127.0.0.1", user: null, originalUrl: "/api/auth/login" };
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await strictAuthRateLimit("login")(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it("throws for an unknown preset", () => {
    expect(() => strictAuthRateLimit("notARealPreset")).toThrow(/Unknown strictAuthRateLimit preset/);
  });
});
