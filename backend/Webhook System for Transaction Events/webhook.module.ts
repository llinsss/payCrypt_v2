import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { Webhook, WebhookDelivery } from './models/webhook.entity';
import { WebhookService } from './services/webhook.service';
import { WebhookController } from './controllers/webhook.controller';
import { WebhookQueue } from './queues/webhook.queue';
import { WebhookScheduler } from './services/webhook.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook, WebhookDelivery]),
    BullModule.registerQueue({ name: 'webhooks' }),
    ScheduleModule.forRoot(),
  ],
  providers: [WebhookService, WebhookQueue, WebhookScheduler],
  controllers: [WebhookController],
  exports: [WebhookService],
})
export class WebhookModule {}
