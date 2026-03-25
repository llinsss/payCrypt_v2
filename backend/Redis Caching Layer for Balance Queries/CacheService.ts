import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly redis: Redis;
  private isRedisAvailable = true;

  constructor(
    private readonly configService: ConfigService,
    @InjectMetric('cache_hits_total') private readonly cacheHits: Counter<string>,
    @InjectMetric('cache_misses_total') private readonly cacheMisses: Counter<string>,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      retryStrategy: (times) => {
        if (times > 3) {
          this.logger.warn('Redis unavailable after 3 retries, falling back to DB');
          this.isRedisAvailable = false;
          return null; // stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    this.redis.on('connect', () => {
      this.isRedisAvailable = true;
      this.logger.log('Redis connection established');
    });

    this.redis.on('error', (err) => {
      this.isRedisAvailable = false;
      this.logger.error('Redis connection error:', err.message);
    });

    this.redis.connect().catch((err) => {
      this.logger.warn(`Initial Redis connection failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Get a cached value by key.
   * Returns null on cache miss or Redis failure.
   */
  async get<T>(key: string, metricLabel?: string): Promise<T | null> {
    if (!this.isRedisAvailable) return null;

    try {
      const value = await this.redis.get(key);
      if (value !== null) {
        this.cacheHits.inc({ cache: metricLabel ?? 'generic' });
        return JSON.parse(value) as T;
      }
      this.cacheMisses.inc({ cache: metricLabel ?? 'generic' });
      return null;
    } catch (err) {
      this.logger.error(`Cache GET failed for key "${key}": ${(err as Error).message}`);
      this.cacheMisses.inc({ cache: metricLabel ?? 'generic' });
      return null;
    }
  }

  /**
   * Set a value in cache with optional TTL (seconds).
   * Silently degrades on Redis failure.
   */
  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    if (!this.isRedisAvailable) return;

    const effectiveTtl = ttl ?? this.configService.get<number>('BALANCE_CACHE_TTL', 60);

    try {
      await this.redis.setex(key, effectiveTtl, JSON.stringify(value));
    } catch (err) {
      this.logger.error(`Cache SET failed for key "${key}": ${(err as Error).message}`);
    }
  }

  /**
   * Delete a specific key from cache.
   */
  async delete(key: string): Promise<void> {
    if (!this.isRedisAvailable) return;

    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.error(`Cache DELETE failed for key "${key}": ${(err as Error).message}`);
    }
  }

  /**
   * Invalidate all keys matching a glob pattern.
   * Uses SCAN to avoid blocking Redis with KEYS on large datasets.
   */
  async invalidate(pattern: string): Promise<number> {
    if (!this.isRedisAvailable) return 0;

    try {
      const keys = await this.scanKeys(pattern);
      if (keys.length === 0) return 0;

      // Delete in batches of 100 to avoid large single commands
      const batchSize = 100;
      let deleted = 0;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        deleted += await this.redis.del(...batch);
      }
      this.logger.debug(`Invalidated ${deleted} keys matching "${pattern}"`);
      return deleted;
    } catch (err) {
      this.logger.error(`Cache INVALIDATE failed for pattern "${pattern}": ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * Warm the cache with a map of key → value pairs.
   */
  async warmBatch(entries: Array<{ key: string; value: unknown; ttl?: number }>): Promise<void> {
    if (!this.isRedisAvailable || entries.length === 0) return;

    try {
      const pipeline = this.redis.pipeline();
      const defaultTtl = this.configService.get<number>('BALANCE_CACHE_TTL', 60);

      for (const { key, value, ttl } of entries) {
        pipeline.setex(key, ttl ?? defaultTtl, JSON.stringify(value));
      }

      await pipeline.exec();
      this.logger.log(`Cache warmed with ${entries.length} entries`);
    } catch (err) {
      this.logger.error(`Cache warm failed: ${(err as Error).message}`);
    }
  }

  /**
   * Check whether the Redis connection is healthy.
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; latencyMs?: number; error?: string }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'error', error: (err as Error).message };
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      keys.push(...batch);
      cursor = nextCursor;
    } while (cursor !== '0');

    return keys;
  }
}
