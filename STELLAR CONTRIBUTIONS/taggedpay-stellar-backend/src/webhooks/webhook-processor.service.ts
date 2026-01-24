import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Webhook } from './entities/webhook.entity';
import { DeliveryStatus } from './entities/webhook-delivery.entity';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryService } from './webhook-delivery.service';

interface WebhookJob {
    webhookId: string;
    payload: any;
}

@Processor('webhooks')
export class WebhookProcessor {
    private readonly logger = new Logger(WebhookProcessor.name);

    constructor(
        @InjectRepository(Webhook)
        private readonly webhookRepository: Repository<Webhook>,
        private readonly webhookService: WebhookService,
        private readonly deliveryService: WebhookDeliveryService,
    ) {}

    @Process('deliver-webhook')
    async handleWebhookDelivery(job: Job<WebhookJob>): Promise<void> {
        const { webhookId, payload } = job.data;

        this.logger.log(
            `Processing webhook delivery job ${job.id} for webhook ${webhookId}`,
        );

        // Get the webhook
        const webhook = await this.webhookRepository.findOne({
            where: { id: webhookId },
        });

        if (!webhook) {
            this.logger.error(`Webhook ${webhookId} not found`);
            throw new Error(`Webhook not found`);
        }

        if (!webhook.isActive) {
            this.logger.warn(`Webhook ${webhookId} is inactive, skipping delivery`);
            return;
        }

        // Create delivery log
        const deliveryLog = await this.deliveryService.createDeliveryLog(
            webhookId,
            payload.eventType,
            payload,
        );

        try {
            // Generate signature
            const signature = this.webhookService.generateSignature(
                payload,
                webhook.secret,
            );

            // Deliver the webhook
            const result = await this.deliveryService.deliverWebhook(
                webhook,
                payload,
                signature,
            );

            // Update delivery log based on HTTP status
            const status =
                result.status >= 200 && result.status < 300
                    ? DeliveryStatus.SUCCESS
                    : DeliveryStatus.FAILED;

            await this.deliveryService.updateDeliveryLog(
                deliveryLog.id,
                status,
                result.status,
                result.body,
            );

            if (status === DeliveryStatus.FAILED) {
                throw new Error(
                    `Webhook delivery failed with status ${result.status}`,
                );
            }

            this.logger.log(
                `Webhook ${webhookId} delivered successfully (job ${job.id})`,
            );
        } catch (error) {
            this.logger.error(
                `Webhook delivery failed (job ${job.id}): ${error.message}`,
            );

            // Update delivery log with error
            await this.deliveryService.updateDeliveryLog(
                deliveryLog.id,
                DeliveryStatus.FAILED,
                0,
                error.message,
            );

            // Re-throw to trigger Bull's retry mechanism
            throw error;
        }
    }
}
