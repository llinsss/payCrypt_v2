import { jest } from "@jest/globals";
import rateLimit from "../../middleware/rateLimiter.js";
import RateLimitService from "../../services/RateLimitService.js";
import AuditLog from "../../models/AuditLog.js";

jest.mock("../../services/RateLimitService.js");
jest.mock("../../models/AuditLog.js");
jest.mock("../../models/User.js");

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
    
    const middleware = rateLimit({ endpointName: "api" });
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(RateLimitService.consume).not.toHaveBeenCalled();
  });
});
