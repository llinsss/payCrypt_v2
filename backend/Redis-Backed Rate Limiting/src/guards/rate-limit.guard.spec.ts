import { Test, TestingModule } from "@nestjs/testing";
import { ExecutionContext, HttpException, HttpStatus } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RateLimitGuard } from "./rate-limit.guard";
import { RedisService } from "../services/redis.service";

describe("RateLimitGuard", () => {
  let guard: RateLimitGuard;
  let redisService: RedisService;

  const mockRedisService = {
    zadd: jest.fn(),
    zcard: jest.fn(),
    zremrangebyscore: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
  };

  const mockReflector = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        { provide: RedisService, useValue: mockRedisService },
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
    redisService = module.get<RedisService>(RedisService);

    jest.clearAllMocks();
  });

  const createMockContext = (
    user?: any,
    ip = "192.168.1.1",
    path = "/api/test",
  ): ExecutionContext => {
    const mockResponse = {
      setHeader: jest.fn(),
    };

    const mockRequest = {
      user,
      ip,
      route: { path },
      url: path,
      headers: {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as any;
  };

  describe("Anonymous User Rate Limiting", () => {
    it("should allow requests within limit", async () => {
      mockRedisService.zremrangebyscore.mockResolvedValue(0);
      mockRedisService.zcard.mockResolvedValue(50);
      mockRedisService.zadd.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(true);

      const context = createMockContext();
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRedisService.zadd).toHaveBeenCalled();
    });

    it("should block requests exceeding limit", async () => {
      mockRedisService.zremrangebyscore.mockResolvedValue(0);
      mockRedisService.zcard.mockResolvedValue(100);

      const context = createMockContext();

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
      expect(mockRedisService.zadd).not.toHaveBeenCalled();
    });

    it("should set correct rate limit headers", async () => {
      mockRedisService.zremrangebyscore.mockResolvedValue(0);
      mockRedisService.zcard.mockResolvedValue(50);
      mockRedisService.zadd.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(true);

      const context = createMockContext();
      const response = context.switchToHttp().getResponse();

      await guard.canActivate(context);

      expect(response.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Limit",
        "100",
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Remaining",
        expect.any(String),
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        "X-RateLimit-Reset",
        expect.any(String),
      );
    });
  });

  describe("Authenticated User Rate Limiting", () => {
    it("should apply higher limits for authenticated users", async () => {
      mockRedisService.zremrangebyscore.mockResolvedValue(0);
      mockRedisService.zcard.mockResolvedValue(500);
      mockRedisService.zadd.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(true);

      const context = createMockContext({ id: "user123", role: "user" });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it("should use user ID in rate limit key", async () => {
      mockRedisService.zremrangebyscore.mockResolvedValue(0);
      mockRedisService.zcard.mockResolvedValue(0);
      mockRedisService.zadd.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(true);

      const context = createMockContext({ id: "user123", role: "user" });
      await guard.canActivate(context);

      const zaddCall = mockRedisService.zadd.mock.calls[0];
      expect(zaddCall[0]).toContain("user:user123");
    });
  });

  describe("Admin User Rate Limiting", () => {
    it("should apply highest limits for admin users", async () => {
      mockRedisService.zremrangebyscore.mockResolvedValue(0);
      mockRedisService.zcard.mockResolvedValue(2000);
      mockRedisService.zadd.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(true);

      const context = createMockContext({ id: "admin123", role: "admin" });
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe("Endpoint-Specific Rate Limiting", () => {
    it("should apply stricter limits for login endpoint", async () => {
      mockRedisService.zremrangebyscore.mockResolvedValue(0);
      mockRedisService.zcard.mockResolvedValue(5);

      const context = createMockContext(
        undefined,
        "192.168.1.1",
        "/api/auth/login",
      );

      await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    });

    it("should apply custom limits for transactions endpoint", async () => {
      mockRedisService.zremrangebyscore.mockResolvedValue(0);
      mockRedisService.zcard.mockResolvedValue(50);
      mockRedisService.zadd.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(true);

      const context = createMockContext(
        undefined,
        "192.168.1.1",
        "/api/transactions",
      );
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe("Whitelist", () => {
    it("should bypass rate limiting for whitelisted IPs", async () => {
      const context = createMockContext(undefined, "127.0.0.1");
      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockRedisService.zcard).not.toHaveBeenCalled();
    });
  });

  describe("429 Response", () => {
    it("should return 429 with Retry-After header", async () => {
      mockRedisService.zremrangebyscore.mockResolvedValue(0);
      mockRedisService.zcard.mockResolvedValue(100);

      const context = createMockContext();
      const response = context.switchToHttp().getResponse();

      try {
        await guard.canActivate(context);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect(response.setHeader).toHaveBeenCalledWith(
          "Retry-After",
          expect.any(String),
        );
      }
    });
  });
});
