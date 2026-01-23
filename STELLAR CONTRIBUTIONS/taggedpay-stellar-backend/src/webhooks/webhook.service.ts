import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import * as crypto from 'crypto';
import { Webhook } from './entities/webhook.entity';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhookEventType } from './interfaces/webhook-event.interface';

@Injectable()
export class WebhookService {
    private readonly logger = new Logger(WebhookService.name);

    constructor(
        @InjectRepository(Webhook)
        private readonly webhookRepository: Repository<Webhook>,
        @InjectQueue('webhooks')
        private readonly webhookQueue: Queue,
    ) {}

    /**
     * Register a new webhook for an account
     * @param createWebhookDto Webhook registration data
     * @returns The created webhook
     */
    async registerWebhook(
        createWebhookDto: CreateWebhookDto,
    ): Promise<Webhook> {
        const { accountTag, url, events, secret } = createWebhookDto;

        // Generate a secret if not provided
        const webhookSecret = secret || this.generateSecret();

        const webhook = this.webhookRepository.create({
            accountTag: accountTag.toLowerCase(),
            url,
            events,
            secret: webhookSecret,
            isActive: true,
        });

        const savedWebhook = await this.webhookRepository.save(webhook);
        this.logger.log(
            `Webhook registered for @${accountTag}: ${webhook.id}`,
        );

        return savedWebhook;
    }

    /**
     * Get all webhooks for an account
     * @param accountTag The account tag to filter by
     * @returns Array of webhooks
     */
    async getWebhooksByAccount(accountTag: string): Promise<Webhook[]> {
        return this.webhookRepository.find({
            where: { accountTag: accountTag.toLowerCase() },
            order: { createdAt: 'DESC' },
        });
    }

    /**
     * Get a specific webhook by ID
     * @param id Webhook ID
     * @param accountTag Optional account tag for authorization
     * @returns The webhook
     */
    async getWebhookById(
        id: string,
        accountTag?: string,
    ): Promise<Webhook> {
        const where: any = { id };
        if (accountTag) {
            where.accountTag = accountTag.toLowerCase();
        }

        const webhook = await this.webhookRepository.findOne({ where });
        if (!webhook) {
            throw new NotFoundException(`Webhook not found`);
        }

        return webhook;
    }

    /**
     * Update a webhook
     * @param id Webhook ID
     * @param accountTag Account tag for authorization
     * @param updateWebhookDto Update data
     * @returns Updated webhook
     */
    async updateWebhook(
        id: string,
        accountTag: string,
        updateWebhookDto: UpdateWebhookDto,
    ): Promise<Webhook> {
        const webhook = await this.getWebhookById(id, accountTag);

        Object.assign(webhook, updateWebhookDto);
        const updated = await this.webhookRepository.save(webhook);

        this.logger.log(`Webhook ${id} updated`);
        return updated;
    }

    /**
     * Remove a webhook
     * @param id Webhook ID
     * @param accountTag Account tag for authorization
     */
    async removeWebhook(id: string, accountTag: string): Promise<void> {
        const webhook = await this.getWebhookById(id, accountTag);
        await this.webhookRepository.remove(webhook);
        this.logger.log(`Webhook ${id} removed`);
    }

    /**
     * Trigger a webhook event for all relevant webhooks
     * @param eventType The type of event
     * @param data The event data
     */
    async triggerEvent(
        eventType: WebhookEventType,
        data: Record<string, any>,
    ): Promise<void> {
        const accountTag = data.accountTag?.toLowerCase();
        if (!accountTag) {
            this.logger.warn('Event data missing accountTag, skipping webhook trigger');
            return;
        }

        // Find all active webhooks subscribed to this event for this account
        const webhooks = await this.webhookRepository.find({
            where: {
                accountTag,
                isActive: true,
            },
        });

        // Filter for webhooks subscribed to this specific event type
        // Also double-check isActive in case of race conditions
        const subscribedWebhooks = webhooks.filter(
            (webhook) => webhook.isActive && webhook.events.includes(eventType),
        );

        if (subscribedWebhooks.length === 0) {
            this.logger.debug(
                `No webhooks subscribed to ${eventType} for @${accountTag}`,
            );
            return;
        }

        const payload = {
            eventType,
            timestamp: new Date(),
            data,
        };

        // Queue delivery jobs for each webhook
        for (const webhook of subscribedWebhooks) {
            await this.webhookQueue.add(
                'deliver-webhook',
                {
                    webhookId: webhook.id,
                    payload,
                },
                {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 60000, // Start with 1 minute
                    },
                },
            );

            this.logger.log(
                `Queued ${eventType} webhook delivery for ${webhook.url}`,
            );
        }
    }

    /**
     * Generate HMAC-SHA256 signature for webhook payload
     * @param payload The webhook payload
     * @param secret The webhook secret
     * @returns The signature
     */
    generateSignature(payload: any, secret: string): string {
        const payloadStr = JSON.stringify(payload);
        return crypto
            .createHmac('sha256', secret)
            .update(payloadStr)
            .digest('hex');
    }

    /**
     * Verify webhook signature
     * @param payload The webhook payload
     * @param signature The signature to verify
     * @param secret The webhook secret
     * @returns True if signature is valid
     */
    verifySignature(
        payload: any,
        signature: string,
        secret: string,
    ): boolean {
        const expectedSignature = this.generateSignature(payload, secret);
        
        // timingSafeEqual requires buffers of equal length
        if (signature.length !== expectedSignature.length) {
            return false;
        }
        
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature),
        );
    }

    /**
     * Generate a random secret for webhook signing
     * @returns Random secret string
     */
    private generateSecret(): string {
        return crypto.randomBytes(32).toString('hex');
    }
}
