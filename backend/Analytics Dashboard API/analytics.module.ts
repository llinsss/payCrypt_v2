import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

// Import your Transaction entity here:
// import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [
    // TypeOrmModule.forFeature([Transaction]),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
