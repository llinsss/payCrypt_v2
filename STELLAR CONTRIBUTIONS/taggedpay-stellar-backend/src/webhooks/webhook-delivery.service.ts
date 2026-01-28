import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    WebhookDelivery,
    DeliveryStatus,
} from './entities/webhook-delivery.entity';
import { Webhook } from './entities/webhook.entity';

@Injectable()
export class WebhookDeliveryService {
    private readonly logger = new Logger(WebhookDeliveryService.name);

    constructor(
        @InjectRepository(WebhookDelivery)
        private readonly deliveryRepository: Repository<WebhookDelivery>,
    ) {}

    /**
     * Create a new delivery log entry
     * @param webhookId Webhook ID
     * @param eventType Event type
     * @param payload Event payload
     * @returns The created delivery log
     */
    async createDeliveryLog(
        webhookId: string,
        eventType: string,
        payload: Record<string, any>,
    ): Promise<WebhookDelivery> {
        const delivery = this.deliveryRepository.create({
            webhookId,
            eventType,
            payload,
            status: DeliveryStatus.PENDING,
            attempts: 0,
        });

        return this.deliveryRepository.save(delivery);
    }

    /**
     * Update delivery log after an attempt
     * @param deliveryId Delivery log ID
     * @param status Delivery status
     * @param responseStatus HTTP response status code
     * @param responseBody HTTP response body
     */
    async updateDeliveryLog(
        deliveryId: string,
        status: DeliveryStatus,
        responseStatus?: number,
        responseBody?: string,
    ): Promise<void> {
        const delivery = await this.deliveryRepository.findOne({
            where: { id: deliveryId },
        });

        if (!delivery) {
            this.logger.error(`Delivery log ${deliveryId} not found`);
            return;
        }

        delivery.attempts += 1;
        delivery.status = status;
        delivery.lastAttemptAt = new Date();
        
        if (responseStatus !== undefined) {
            delivery.responseStatus = responseStatus;
        }
        if (responseBody !== undefined) {
            delivery.responseBody = responseBody;
        }

        if (status === DeliveryStatus.SUCCESS) {
            delivery.deliveredAt = new Date();
        }

        await this.deliveryRepository.save(delivery);
    }

    /**
     * Get delivery logs for a webhook
     * @param webhookId Webhook ID
     * @param limit Maximum number of logs to return
     * @returns Array of delivery logs
     */
    async getDeliveryLogs(
        webhookId: string,
        limit: number = 50,
    ): Promise<WebhookDelivery[]> {
        return this.deliveryRepository.find({
            where: { webhookId },
            order: { createdAt: 'DESC' },
            take: limit,
        });
    }

    /**
     * Get delivery statistics for a webhook
     * @param webhookId Webhook ID
     * @returns Delivery statistics
     */
    async getDeliveryStats(webhookId: string): Promise<{
        total: number;
        success: number;
        failed: number;
        pending: number;
    }> {
        const [total, success, failed, pending] = await Promise.all([
            this.deliveryRepository.count({ where: { webhookId } }),
            this.deliveryRepository.count({
                where: { webhookId, status: DeliveryStatus.SUCCESS },
            }),
            this.deliveryRepository.count({
                where: { webhookId, status: DeliveryStatus.FAILED },
            }),
            this.deliveryRepository.count({
                where: { webhookId, status: DeliveryStatus.PENDING },
            }),
        ]);

        return { total, success, failed, pending };
    }

    /**
     * Deliver a webhook via HTTP POST
     * @param webhook Webhook to deliver to
     * @param payload Event payload
     * @param signature HMAC signature
     * @returns Delivery result
     */
    async deliverWebhook(
        webhook: Webhook,
        payload: any,
        signature: string,
    ): Promise<{ status: number; body: string }> {
        try {
            const response = await fetch(webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Webhook-Signature': signature,
                    'User-Agent': 'Tagged-Webhook/1.0',
                },
                body: JSON.stringify(payload),
            });

            const body = await response.text();

            this.logger.log(
                `Webhook delivery to ${webhook.url}: ${response.status}`,
            );

            return {
                status: response.status,
                body: body.substring(0, 1000), // Limit response body size
            };
        } catch (error) {
            this.logger.error(
                `Webhook delivery failed: ${error.message}`,
                error.stack,
            );
            throw error;
        }
    }
}
