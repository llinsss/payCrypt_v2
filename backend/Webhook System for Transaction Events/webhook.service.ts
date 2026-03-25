import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import * as crypto from 'crypto';
import * as https from 'https';
import * as http from 'http';
import { Webhook, WebhookDelivery, WebhookEvent } from '../models/webhook.entity';
import { CreateWebhookDto, UpdateWebhookDto } from '../dto/webhook.dto';

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, any>;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly RETRY_DELAYS = [1000, 10000, 60000]; // 1s, 10s, 60s

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepo: Repository<Webhook>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
    @InjectQueue('webhooks')
    private readonly webhookQueue: Queue,
  ) {}

  // ──────────────────────────── CRUD ────────────────────────────

  async create(userId: number, dto: CreateWebhookDto): Promise<Webhook> {
    const secret = dto.secret ?? this.generateSecret();
    const webhook = this.webhookRepo.create({ userId, ...dto, secret });
    return this.webhookRepo.save(webhook);
  }

  async findAll(userId: number): Promise<Webhook[]> {
    return this.webhookRepo.find({ where: { userId } });
  }

  async findOne(userId: number, id: number): Promise<Webhook> {
    const webhook = await this.webhookRepo.findOne({ where: { id } });
    if (!webhook) throw new NotFoundException(`Webhook ${id} not found`);
    if (webhook.userId !== userId) throw new ForbiddenException();
    return webhook;
  }

  async update(userId: number, id: number, dto: UpdateWebhookDto): Promise<Webhook> {
    const webhook = await this.findOne(userId, id);
    Object.assign(webhook, dto);
    return this.webhookRepo.save(webhook);
  }

  async remove(userId: number, id: number): Promise<void> {
    const webhook = await this.findOne(userId, id);
    await this.webhookRepo.remove(webhook);
  }

  // ────────────────────────── Deliveries ──────────────────────────

  async getDeliveries(
    userId: number,
    webhookId: number,
    limit = 50,
    offset = 0,
  ): Promise<[WebhookDelivery[], number]> {
    await this.findOne(userId, webhookId); // auth check
    return this.deliveryRepo.findAndCount({
      where: { webhookId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  // ────────────────────────── Dispatch ──────────────────────────

  /**
   * Called by the Transaction service when a transaction event occurs.
   * Enqueues delivery jobs for all matching active webhooks.
   */
  async dispatch(userId: number, event: WebhookEvent, data: Record<string, any>): Promise<void> {
    const webhooks = await this.webhookRepo
      .createQueryBuilder('w')
      .where('w.user_id = :userId', { userId })
      .andWhere('w.active = true')
      .andWhere(':event = ANY(w.events)', { event })
      .getMany();

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    for (const webhook of webhooks) {
      const delivery = await this.deliveryRepo.save(
        this.deliveryRepo.create({
          webhookId: webhook.id,
          eventType: event,
          payload,
          status: 'pending',
        }),
      );

      await this.webhookQueue.add(
        'deliver',
        { deliveryId: delivery.id },
        { delay: 0, attempts: 1 },
      );
    }
  }

  // ──────────────────────── Delivery Worker ─────────────────────

  async processDelivery(deliveryId: number): Promise<void> {
    const delivery = await this.deliveryRepo.findOne({
      where: { id: deliveryId },
      relations: ['webhook'],
    });

    if (!delivery || !delivery.webhook) {
      this.logger.warn(`Delivery ${deliveryId} not found or webhook deleted`);
      return;
    }

    const { webhook } = delivery;
    const payload = delivery.payload as WebhookPayload;
    const signature = this.sign(webhook.secret, payload);

    delivery.attempts += 1;
    delivery.lastAttemptAt = new Date();

    try {
      const { statusCode, body } = await this.post(webhook.url, payload, signature);
      delivery.responseCode = statusCode;
      delivery.responseBody = body.slice(0, 1000);
      delivery.status = statusCode >= 200 && statusCode < 300 ? 'success' : 'failed';

      if (delivery.status === 'failed') {
        await this.scheduleRetry(delivery);
      }
    } catch (err) {
      delivery.responseCode = null;
      delivery.responseBody = (err as Error).message;
      delivery.status = 'failed';
      await this.scheduleRetry(delivery);
    }

    await this.deliveryRepo.save(delivery);
  }

  private async scheduleRetry(delivery: WebhookDelivery): Promise<void> {
    const attemptIndex = delivery.attempts - 1; // 0-based
    if (attemptIndex < this.RETRY_DELAYS.length) {
      const delay = this.RETRY_DELAYS[attemptIndex];
      delivery.status = 'retrying';
      delivery.nextRetryAt = new Date(Date.now() + delay);
      await this.webhookQueue.add(
        'deliver',
        { deliveryId: delivery.id },
        { delay },
      );
    }
    // else: max retries exceeded, leave as 'failed'
  }

  // ──────────────────────────── Helpers ─────────────────────────

  sign(secret: string, payload: WebhookPayload): string {
    return crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private post(
    url: string,
    payload: WebhookPayload,
    signature: string,
  ): Promise<{ statusCode: number; body: string }> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const parsedUrl = new URL(url);
      const lib = parsedUrl.protocol === 'https:' ? https : http;

      const req = lib.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'X-Webhook-Signature': signature,
            'X-Webhook-Timestamp': Date.now().toString(),
          },
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode!, body: data }));
        },
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out after 5s'));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  // ────────────────────── Cleanup (scheduled) ───────────────────

  async pruneOldDeliveries(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
    await this.deliveryRepo
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff })
      .execute();
    this.logger.log('Pruned delivery logs older than 30 days');
  }
}
