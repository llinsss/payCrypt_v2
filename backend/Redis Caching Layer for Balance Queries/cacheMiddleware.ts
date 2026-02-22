import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { CacheService } from '../services/CacheService';

export interface CacheMiddlewareOptions {
  /** Key builder from the request. Returning null/undefined skips caching. */
  keyBuilder: (req: Request) => string | null | undefined;
  /** TTL in seconds (falls back to BALANCE_CACHE_TTL env var or 60). */
  ttl?: number;
  /** Only cache responses with these status codes (default: [200]). */
  cacheableStatuses?: number[];
}

/**
 * Generic route-level response caching middleware.
 *
 * Usage in a NestJS module:
 *
 *   consumer
 *     .apply(
 *       CacheMiddleware.with({
 *         keyBuilder: (req) => `route:balances:${req.params.userId}:${req.params.chainId}`,
 *         ttl: 30,
 *       }),
 *     )
 *     .forRoutes({ path: 'balances/:userId/:chainId', method: RequestMethod.GET });
 */
@Injectable()
export class CacheMiddleware implements NestMiddleware {
  private static readonly logger = new Logger(CacheMiddleware.name);

  // Options are bound per-factory-call via the static `with` helper.
  private options: CacheMiddlewareOptions = {
    keyBuilder: () => null,
  };

  constructor(private readonly cacheService: CacheService) {}

  /** Factory: returns a middleware class with bound options. */
  static with(options: CacheMiddlewareOptions): typeof CacheMiddleware {
    // Return a subclass so NestJS DI still resolves CacheService
    return class extends CacheMiddleware {
      constructor(cacheService: CacheService) {
        super(cacheService);
        this.options = options;
      }
    } as unknown as typeof CacheMiddleware;
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const cacheableStatuses = this.options.cacheableStatuses ?? [200];

    // Only cache safe methods
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const key = this.options.keyBuilder(req);
    if (!key) return next();

    // Try to serve from cache
    const cached = await this.cacheService.get<{ status: number; body: unknown }>(key);
    if (cached) {
      CacheMiddleware.logger.debug(`Cache HIT ${key}`);
      res.status(cached.status).json(cached.body);
      return;
    }

    CacheMiddleware.logger.debug(`Cache MISS ${key}`);

    // Intercept the response to populate the cache
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (cacheableStatuses.includes(res.statusCode)) {
        this.cacheService
          .set(key, { status: res.statusCode, body }, this.options.ttl)
          .catch((err) =>
            CacheMiddleware.logger.warn(`Failed to cache response: ${err.message}`),
          );
      }
      return originalJson(body);
    };

    next();
  }
}
