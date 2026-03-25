import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { WebhookService } from '../services/webhook.service';

@Processor('webhooks')
export class WebhookQueue {
  private readonly logger = new Logger(WebhookQueue.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Process('deliver')
  async handleDelivery(job: Job<{ deliveryId: number }>): Promise<void> {
    const { deliveryId } = job.data;
    this.logger.debug(`Processing delivery job ${job.id} for delivery ${deliveryId}`);
    await this.webhookService.processDelivery(deliveryId);
  }
}
