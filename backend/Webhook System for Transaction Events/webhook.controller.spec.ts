import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { WebhookController } from '../../src/webhooks/controllers/webhook.controller';
import { WebhookService } from '../../src/webhooks/services/webhook.service';
import { ThrottlerModule } from '@nestjs/throttler';

// Stub auth guard
jest.mock('../../src/auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class {
    canActivate(ctx: any) {
      const req = ctx.switchToHttp().getRequest();
      req.user = { id: 42 };
      return true;
    }
  },
}));

const serviceMock = {
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getDeliveries: jest.fn(),
};

describe('WebhookController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])],
      controllers: [WebhookController],
      providers: [{ provide: WebhookService, useValue: serviceMock }],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(() => app.close());
  afterEach(() => jest.clearAllMocks());

  // ── POST /api/webhooks ──

  describe('POST /api/webhooks', () => {
    it('creates a webhook', async () => {
      const webhook = { id: 1, url: 'https://example.com/hook', events: ['transaction.completed'] };
      serviceMock.create.mockResolvedValue(webhook);

      await request(app.getHttpServer())
        .post('/api/webhooks')
        .send({ url: 'https://example.com/hook', events: ['transaction.completed'] })
        .expect(201)
        .expect(webhook);

      expect(serviceMock.create).toHaveBeenCalledWith(42, {
        url: 'https://example.com/hook',
        events: ['transaction.completed'],
      });
    });

    it('returns 400 for invalid URL', async () => {
      await request(app.getHttpServer())
        .post('/api/webhooks')
        .send({ url: 'not-a-url', events: ['transaction.completed'] })
        .expect(400);
    });

    it('returns 400 for invalid event type', async () => {
      await request(app.getHttpServer())
        .post('/api/webhooks')
        .send({ url: 'https://example.com/hook', events: ['transaction.invalid'] })
        .expect(400);
    });

    it('returns 400 when events array is empty', async () => {
      await request(app.getHttpServer())
        .post('/api/webhooks')
        .send({ url: 'https://example.com/hook', events: [] })
        .expect(400);
    });
  });

  // ── GET /api/webhooks ──

  describe('GET /api/webhooks', () => {
    it('returns all webhooks for the user', async () => {
      const webhooks = [{ id: 1 }, { id: 2 }];
      serviceMock.findAll.mockResolvedValue(webhooks);

      await request(app.getHttpServer())
        .get('/api/webhooks')
        .expect(200)
        .expect(webhooks);
    });
  });

  // ── PUT /api/webhooks/:id ──

  describe('PUT /api/webhooks/:id', () => {
    it('updates a webhook', async () => {
      const updated = { id: 1, active: false };
      serviceMock.update.mockResolvedValue(updated);

      await request(app.getHttpServer())
        .put('/api/webhooks/1')
        .send({ active: false })
        .expect(200)
        .expect(updated);
    });
  });

  // ── DELETE /api/webhooks/:id ──

  describe('DELETE /api/webhooks/:id', () => {
    it('removes a webhook and returns 204', async () => {
      serviceMock.remove.mockResolvedValue(undefined);

      await request(app.getHttpServer())
        .delete('/api/webhooks/1')
        .expect(204);
    });
  });

  // ── GET /api/webhooks/:id/deliveries ──

  describe('GET /api/webhooks/:id/deliveries', () => {
    it('returns delivery logs', async () => {
      const deliveries = [{ id: 1, status: 'success' }];
      serviceMock.getDeliveries.mockResolvedValue([deliveries, 1]);

      await request(app.getHttpServer())
        .get('/api/webhooks/1/deliveries')
        .expect(200);

      expect(serviceMock.getDeliveries).toHaveBeenCalledWith(42, 1, 50, 0);
    });

    it('supports pagination params', async () => {
      serviceMock.getDeliveries.mockResolvedValue([[], 0]);

      await request(app.getHttpServer())
        .get('/api/webhooks/1/deliveries?limit=10&offset=20')
        .expect(200);

      expect(serviceMock.getDeliveries).toHaveBeenCalledWith(42, 1, 10, 20);
    });
  });
});
