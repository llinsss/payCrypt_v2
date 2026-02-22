import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD,
  /** Balance-specific cache TTL in seconds */
  balanceCacheTtl: parseInt(process.env.BALANCE_CACHE_TTL ?? '60', 10),
  /** How many top-active users to warm on startup / scheduled run */
  cacheWarmingLimit: parseInt(process.env.CACHE_WARMING_LIMIT ?? '1000', 10),
}));
