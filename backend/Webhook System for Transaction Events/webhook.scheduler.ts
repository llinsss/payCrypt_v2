import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebhookService } from './webhook.service';

@Injectable()
export class WebhookScheduler {
  private readonly logger = new Logger(WebhookScheduler.name);

  constructor(private readonly webhookService: WebhookService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async pruneDeliveries(): Promise<void> {
    this.logger.log('Running delivery log cleanup...');
    await this.webhookService.pruneOldDeliveries();
  }
}
