import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { Repository } from 'typeorm';
import { WebhookService } from '../../src/webhooks/services/webhook.service';
import { Webhook, WebhookDelivery } from '../../src/webhooks/models/webhook.entity';

// ─────────────────────── Helpers ────────────────────────────────

const makeWebhook = (overrides: Partial<Webhook> = {}): Webhook =>
  Object.assign(new Webhook(), {
    id: 1,
    userId: 42,
    url: 'https://example.com/hook',
    secret: 'a'.repeat(64),
    events: ['transaction.completed'],
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

const makeDelivery = (overrides: Partial<WebhookDelivery> = {}): WebhookDelivery =>
  Object.assign(new WebhookDelivery(), {
    id: 1,
    webhookId: 1,
    eventType: 'transaction.completed',
    payload: { event: 'transaction.completed', timestamp: new Date().toISOString(), data: {} },
    status: 'pending',
    attempts: 0,
    ...overrides,
  });

// ─────────────────────── Mock factory ──────────────────────────

const repoMock = () => ({
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({}),
  })),
});

const queueMock = () => ({ add: jest.fn() });

// ─────────────────────── Suite ──────────────────────────────────

describe('WebhookService', () => {
  let service: WebhookService;
  let webhookRepo: jest.Mocked<Repository<Webhook>>;
  let deliveryRepo: jest.Mocked<Repository<WebhookDelivery>>;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: getRepositoryToken(Webhook), useFactory: repoMock },
        { provide: getRepositoryToken(WebhookDelivery), useFactory: repoMock },
        { provide: getQueueToken('webhooks'), useFactory: queueMock },
      ],
    }).compile();

    service = module.get(WebhookService);
    webhookRepo = module.get(getRepositoryToken(Webhook));
    deliveryRepo = module.get(getRepositoryToken(WebhookDelivery));
    queue = module.get(getQueueToken('webhooks'));
  });

  // ────────────── CRUD ──────────────

  describe('create', () => {
    it('generates a secret when none is provided', async () => {
      const webhook = makeWebhook();
      webhookRepo.create.mockReturnValue(webhook);
      webhookRepo.save.mockResolvedValue(webhook);

      const result = await service.create(42, {
        url: 'https://example.com/hook',
        events: ['transaction.completed'],
      });

      expect(webhookRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 42, url: 'https://example.com/hook' }),
      );
      expect(result).toEqual(webhook);
    });

    it('uses the caller-supplied secret', async () => {
      const webhook = makeWebhook({ secret: 'mysupersecret1234567890123456789' });
      webhookRepo.create.mockReturnValue(webhook);
      webhookRepo.save.mockResolvedValue(webhook);

      await service.create(42, {
        url: 'https://example.com/hook',
        events: ['transaction.completed'],
        secret: 'mysupersecret1234567890123456789',
      });

      expect(webhookRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ secret: 'mysupersecret1234567890123456789' }),
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException for unknown id', async () => {
      webhookRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne(42, 999)).rejects.toThrow('Webhook 999 not found');
    });

    it('throws ForbiddenException for wrong user', async () => {
      webhookRepo.findOne.mockResolvedValue(makeWebhook({ userId: 99 }));
      await expect(service.findOne(42, 1)).rejects.toThrow('Forbidden');
    });
  });

  describe('remove', () => {
    it('deletes the webhook', async () => {
      const webhook = makeWebhook();
      webhookRepo.findOne.mockResolvedValue(webhook);
      webhookRepo.remove.mockResolvedValue(webhook);

      await service.remove(42, 1);
      expect(webhookRepo.remove).toHaveBeenCalledWith(webhook);
    });
  });

  // ────────────── Signature ──────────────

  describe('sign', () => {
    it('produces consistent HMAC-SHA256 signatures', () => {
      const payload = {
        event: 'transaction.completed' as const,
        timestamp: '2024-02-21T10:30:00.000Z',
        data: { id: 123 },
      };
      const secret = 'test-secret';
      const sig1 = service.sign(secret, payload);
      const sig2 = service.sign(secret, payload);

      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/); // hex SHA256
    });

    it('produces different signatures for different secrets', () => {
      const payload = {
        event: 'transaction.completed' as const,
        timestamp: '2024-02-21T10:30:00.000Z',
        data: {},
      };
      expect(service.sign('secret-a', payload)).not.toBe(service.sign('secret-b', payload));
    });

    it('produces different signatures when payload changes', () => {
      const base = {
        event: 'transaction.completed' as const,
        timestamp: '2024-02-21T10:30:00.000Z',
        data: { amount: '100.00' },
      };
      const modified = { ...base, data: { amount: '200.00' } };
      expect(service.sign('secret', base)).not.toBe(service.sign('secret', modified));
    });
  });

  // ────────────── Dispatch ──────────────

  describe('dispatch', () => {
    it('enqueues a job for each matching active webhook', async () => {
      const webhook = makeWebhook();
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([webhook]),
      };
      webhookRepo.createQueryBuilder.mockReturnValue(qb as any);

      const delivery = makeDelivery();
      deliveryRepo.create.mockReturnValue(delivery);
      deliveryRepo.save.mockResolvedValue(delivery);

      await service.dispatch(42, 'transaction.completed', { id: 1 });

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith(
        'deliver',
        { deliveryId: delivery.id },
        { delay: 0, attempts: 1 },
      );
    });

    it('does not enqueue jobs when no matching webhooks exist', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      webhookRepo.createQueryBuilder.mockReturnValue(qb as any);

      await service.dispatch(42, 'transaction.failed', { id: 1 });
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  // ────────────── Retry logic ──────────────

  describe('processDelivery - retry logic', () => {
    const setupDeliveryWithWebhook = (attempts: number) => {
      const webhook = makeWebhook();
      const delivery = makeDelivery({ attempts, webhook, status: 'pending' });
      deliveryRepo.findOne.mockResolvedValue(delivery);
      deliveryRepo.save.mockResolvedValue(delivery);
      return { webhook, delivery };
    };

    it('schedules retry after 1s on first failure', async () => {
      setupDeliveryWithWebhook(0);
      // Make the HTTP call throw
      jest.spyOn(service as any, 'post').mockRejectedValue(new Error('Connection refused'));

      await service.processDelivery(1);

      expect(queue.add).toHaveBeenCalledWith('deliver', { deliveryId: 1 }, { delay: 1000 });
      const saved = (deliveryRepo.save as jest.Mock).mock.calls[0][0];
      expect(saved.status).toBe('retrying');
    });

    it('schedules retry after 10s on second failure', async () => {
      setupDeliveryWithWebhook(1);
      jest.spyOn(service as any, 'post').mockRejectedValue(new Error('Connection refused'));

      await service.processDelivery(1);

      expect(queue.add).toHaveBeenCalledWith('deliver', { deliveryId: 1 }, { delay: 10000 });
    });

    it('schedules retry after 60s on third failure', async () => {
      setupDeliveryWithWebhook(2);
      jest.spyOn(service as any, 'post').mockRejectedValue(new Error('Connection refused'));

      await service.processDelivery(1);

      expect(queue.add).toHaveBeenCalledWith('deliver', { deliveryId: 1 }, { delay: 60000 });
    });

    it('marks as failed with no retry after 3 failed attempts', async () => {
      setupDeliveryWithWebhook(3);
      jest.spyOn(service as any, 'post').mockRejectedValue(new Error('Connection refused'));

      await service.processDelivery(1);

      expect(queue.add).not.toHaveBeenCalled();
      const saved = (deliveryRepo.save as jest.Mock).mock.calls[0][0];
      expect(saved.status).toBe('failed');
    });

    it('marks as success on 2xx response', async () => {
      setupDeliveryWithWebhook(0);
      jest.spyOn(service as any, 'post').mockResolvedValue({ statusCode: 200, body: 'OK' });

      await service.processDelivery(1);

      const saved = (deliveryRepo.save as jest.Mock).mock.calls[0][0];
      expect(saved.status).toBe('success');
      expect(saved.responseCode).toBe(200);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('marks as failed on 4xx/5xx response and schedules retry', async () => {
      setupDeliveryWithWebhook(0);
      jest.spyOn(service as any, 'post').mockResolvedValue({ statusCode: 500, body: 'Error' });

      await service.processDelivery(1);

      const saved = (deliveryRepo.save as jest.Mock).mock.calls[0][0];
      expect(saved.status).toBe('retrying');
      expect(queue.add).toHaveBeenCalled();
    });
  });

  // ────────────── Deliveries ──────────────

  describe('getDeliveries', () => {
    it('returns delivery logs with pagination', async () => {
      webhookRepo.findOne.mockResolvedValue(makeWebhook());
      deliveryRepo.findAndCount.mockResolvedValue([[makeDelivery()], 1]);

      const [items, count] = await service.getDeliveries(42, 1, 10, 0);
      expect(items).toHaveLength(1);
      expect(count).toBe(1);
    });
  });

  // ────────────── Cleanup ──────────────

  describe('pruneOldDeliveries', () => {
    it('deletes deliveries older than 30 days', async () => {
      const qb = {
        delete: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };
      deliveryRepo.createQueryBuilder.mockReturnValue(qb as any);

      await service.pruneOldDeliveries();
      expect(qb.execute).toHaveBeenCalled();
    });
  });
});
