import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RedisService } from "../services/redis.service";
import { rateLimitsConfig } from "../config/rate-limits.config";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const clientIp = this.getClientIp(request);

    // Check whitelist
    if (rateLimitsConfig.whitelist.includes(clientIp)) {
      return true;
    }

    const endpoint = request.route?.path || request.url;
    const user = request.user;

    // Determine rate limit config
    const config = this.getRateLimitConfig(endpoint, user);
    const key = this.generateKey(endpoint, clientIp, user);

    const { allowed, limit, remaining, resetTime } = await this.checkRateLimit(
      key,
      config,
    );

    // Set rate limit headers
    response.setHeader("X-RateLimit-Limit", limit.toString());
    response.setHeader(
      "X-RateLimit-Remaining",
      Math.max(0, remaining).toString(),
    );
    response.setHeader("X-RateLimit-Reset", resetTime.toString());

    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      response.setHeader("Retry-After", retryAfter.toString());

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: config.message || "Too many requests",
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getRateLimitConfig(endpoint: string, user: any) {
    // Check for endpoint-specific limits
    if (rateLimitsConfig.endpoints[endpoint]) {
      return rateLimitsConfig.endpoints[endpoint];
    }

    // Check user role
    if (user?.role === "admin") {
      return rateLimitsConfig.admin;
    }

    if (user) {
      return rateLimitsConfig.authenticated;
    }

    return rateLimitsConfig.anonymous;
  }

  private generateKey(endpoint: string, ip: string, user: any): string {
    if (user) {
      return `rate-limit:user:${user.id}:${endpoint}`;
    }
    return `rate-limit:ip:${ip}:${endpoint}`;
  }

  private async checkRateLimit(key: string, config: any) {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Remove old entries
    await this.redisService.zremrangebyscore(key, 0, windowStart);

    // Count requests in current window
    const requestCount = await this.redisService.zcard(key);

    const allowed = requestCount < config.max;
    const resetTime = now + config.windowMs;

    if (allowed) {
      // Add current request
      await this.redisService.zadd(key, now, `${now}-${Math.random()}`);
      await this.redisService.expire(key, Math.ceil(config.windowMs / 1000));
    }

    return {
      allowed,
      limit: config.max,
      remaining: config.max - requestCount - (allowed ? 1 : 0),
      resetTime,
    };
  }

  private getClientIp(request: any): string {
    return (
      request.headers["x-forwarded-for"]?.split(",")[0] ||
      request.headers["x-real-ip"] ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      "0.0.0.0"
    );
  }
}
