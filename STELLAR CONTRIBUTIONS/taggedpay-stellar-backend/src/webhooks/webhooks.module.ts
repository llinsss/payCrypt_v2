import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { WebhooksController } from './webhooks.controller';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { WebhookProcessor } from './webhook-processor.service';
import { Webhook } from './entities/webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Webhook, WebhookDelivery]),
        BullModule.registerQueue({
            name: 'webhooks',
        }),
    ],
    controllers: [WebhooksController],
    providers: [WebhookService, WebhookDeliveryService, WebhookProcessor],
    exports: [WebhookService],
})
export class WebhooksModule {}
