import {
    Controller,
    Post,
    Get,
    Delete,
    Patch,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryService } from './webhook-delivery.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { Webhook } from './entities/webhook.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhookEventType } from './interfaces/webhook-event.interface';

@Controller('webhooks')
export class WebhooksController {
    constructor(
        private readonly webhookService: WebhookService,
        private readonly deliveryService: WebhookDeliveryService,
    ) {}

    /**
     * POST /api/v1/webhooks
     * Register a new webhook
     */
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async registerWebhook(
        @Body() createWebhookDto: CreateWebhookDto,
    ): Promise<{
        success: boolean;
        data: Webhook;
    }> {
        const webhook = await this.webhookService.registerWebhook(
            createWebhookDto,
        );

        return {
            success: true,
            data: webhook,
        };
    }

    /**
     * GET /api/v1/webhooks?accountTag=xxx
     * Get all webhooks for an account
     */
    @Get()
    async getWebhooks(
        @Query('accountTag') accountTag: string,
    ): Promise<{
        success: boolean;
        data: Webhook[];
    }> {
        const webhooks = await this.webhookService.getWebhooksByAccount(
            accountTag,
        );

        return {
            success: true,
            data: webhooks,
        };
    }

    /**
     * GET /api/v1/webhooks/:id
     * Get a specific webhook
     */
    @Get(':id')
    async getWebhook(
        @Param('id') id: string,
        @Query('accountTag') accountTag?: string,
    ): Promise<{
        success: boolean;
        data: Webhook;
    }> {
        const webhook = await this.webhookService.getWebhookById(
            id,
            accountTag,
        );

        return {
            success: true,
            data: webhook,
        };
    }

    /**
     * PATCH /api/v1/webhooks/:id
     * Update a webhook
     */
    @Patch(':id')
    async updateWebhook(
        @Param('id') id: string,
        @Query('accountTag') accountTag: string,
        @Body() updateWebhookDto: UpdateWebhookDto,
    ): Promise<{
        success: boolean;
        data: Webhook;
    }> {
        const webhook = await this.webhookService.updateWebhook(
            id,
            accountTag,
            updateWebhookDto,
        );

        return {
            success: true,
            data: webhook,
        };
    }

    /**
     * DELETE /api/v1/webhooks/:id
     * Remove a webhook
     */
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async removeWebhook(
        @Param('id') id: string,
        @Query('accountTag') accountTag: string,
    ): Promise<void> {
        await this.webhookService.removeWebhook(id, accountTag);
    }

    /**
     * GET /api/v1/webhooks/:id/deliveries
     * Get delivery logs for a webhook
     */
    @Get(':id/deliveries')
    async getDeliveries(
        @Param('id') id: string,
        @Query('accountTag') accountTag: string,
        @Query('limit') limit?: number,
    ): Promise<{
        success: boolean;
        data: {
            deliveries: WebhookDelivery[];
            stats: any;
        };
    }> {
        // Verify webhook belongs to account
        await this.webhookService.getWebhookById(id, accountTag);

        const [deliveries, stats] = await Promise.all([
            this.deliveryService.getDeliveryLogs(id, limit),
            this.deliveryService.getDeliveryStats(id),
        ]);

        return {
            success: true,
            data: {
                deliveries,
                stats,
            },
        };
    }

    /**
     * POST /api/v1/webhooks/:id/test
     * Send a test webhook event
     */
    @Post(':id/test')
    async testWebhook(
        @Param('id') id: string,
        @Query('accountTag') accountTag: string,
    ): Promise<{
        success: boolean;
        message: string;
    }> {
        const webhook = await this.webhookService.getWebhookById(
            id,
            accountTag,
        );

        // Trigger a test event
        await this.webhookService.triggerEvent(WebhookEventType.ACCOUNT_CREATED, {
            accountTag: webhook.accountTag,
            publicKey: 'TEST_PUBLIC_KEY',
            balance: '1000.0000000',
            createdAt: new Date(),
            isTest: true,
        });

        return {
            success: true,
            message: 'Test webhook event queued for delivery',
        };
    }
}
