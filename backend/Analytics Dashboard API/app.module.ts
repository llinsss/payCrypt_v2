/**
 * app.module.ts  –  register the AnalyticsModule here
 *
 * Prerequisites (install if not already present):
 *   npm install @nestjs-modules/ioredis ioredis typeorm @nestjs/typeorm
 *   npm install class-validator class-transformer @nestjs/swagger swagger-ui-express
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    // ── Database ────────────────────────────────────────────────────────────
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: false, // use migrations in production
    }),

    // ── Redis (5-minute analytics cache) ────────────────────────────────────
    RedisModule.forRoot({
      config: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),

    // ── Feature modules ─────────────────────────────────────────────────────
    AnalyticsModule,
    // ... other modules
  ],
})
export class AppModule {}
