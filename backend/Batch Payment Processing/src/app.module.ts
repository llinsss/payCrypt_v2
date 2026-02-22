import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";
import { ThrottlerModule } from "@nestjs/throttler";
import { BatchPaymentModule } from "./batch-payment.module";
import { BatchPayment } from "./entities/batch-payment.entity";
import { Payment } from "./entities/payment.entity";

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      username: process.env.DB_USERNAME || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      database: process.env.DB_DATABASE || "payment_db",
      entities: [BatchPayment, Payment],
      synchronize: process.env.NODE_ENV !== "production", // Auto-create tables in dev
    }),
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 3600000, // 1 hour in milliseconds
        limit: 10, // 10 requests per hour
      },
    ]),
    BatchPaymentModule,
  ],
})
export class AppModule {}
