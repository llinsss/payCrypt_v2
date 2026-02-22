import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getMetricToken } from '@willsoto/nestjs-prometheus';
import { Counter } from 'prom-client';
import { CacheService } from '../../../services/CacheService';

// ── Redis mock ─────────────────────────────────────────────────────────────

const redisMock = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  ping: jest.fn(),
  pipeline: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => redisMock);
});

// ── Counter mock ───────────────────────────────────────────────────────────

const makeCounter = (): jest.Mocked<Counter<string>> =>
  ({ inc: jest.fn() } as unknown as jest.Mocked<Counter<string>>);

// ── Helpers ────────────────────────────────────────────────────────────────

async function buildService() {
  const hitsCounter = makeCounter();
  const missesCounter = makeCounter();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CacheService,
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string, def: unknown) => {
            const map: Record<string, unknown> = {
              REDIS_HOST: 'localhost',
              REDIS_PORT: 6379,
              BALANCE_CACHE_TTL: 60,
            };
            return map[key] ?? def;
          }),
        },
      },
      { provide: getMetricToken('cache_hits_total'), useValue: hitsCounter },
      { provide: getMetricToken('cache_misses_total'), useValue: missesCounter },
    ],
  }).compile();

  const service = module.get<CacheService>(CacheService);
  return { service, hitsCounter, missesCounter };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('CacheService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── get() ──────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns a parsed value and increments hit counter on cache hit', async () => {
      const { service, hitsCounter, missesCounter } = await buildService();
      const payload = { amount: '100', chainId: 1 };
      redisMock.get.mockResolvedValueOnce(JSON.stringify(payload));

      const result = await service.get('balance:user1:1', 'balance');

      expect(result).toEqual(payload);
      expect(hitsCounter.inc).toHaveBeenCalledWith({ cache: 'balance' });
      expect(missesCounter.inc).not.toHaveBeenCalled();
    });

    it('returns null and increments miss counter on cache miss', async () => {
      const { service, missesCounter } = await buildService();
      redisMock.get.mockResolvedValueOnce(null);

      const result = await service.get('balance:user1:1', 'balance');

      expect(result).toBeNull();
      expect(missesCounter.inc).toHaveBeenCalledWith({ cache: 'balance' });
    });

    it('returns null and increments miss counter when Redis throws', async () => {
      const { service, missesCounter } = await buildService();
      redisMock.get.mockRejectedValueOnce(new Error('ECONNRESET'));

      const result = await service.get('any-key');

      expect(result).toBeNull();
      expect(missesCounter.inc).toHaveBeenCalled();
    });

    it('skips Redis and returns null when isRedisAvailable is false', async () => {
      const { service } = await buildService();
      // Force unavailable state
      (service as unknown as { isRedisAvailable: boolean }).isRedisAvailable = false;

      const result = await service.get('key');

      expect(redisMock.get).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  // ── set() ──────────────────────────────────────────────────────────────

  describe('set()', () => {
    it('stores a value with the provided TTL', async () => {
      const { service } = await buildService();
      redisMock.setex.mockResolvedValueOnce('OK');

      await service.set('my-key', { foo: 'bar' }, 30);

      expect(redisMock.setex).toHaveBeenCalledWith('my-key', 30, JSON.stringify({ foo: 'bar' }));
    });

    it('uses the configured default TTL when none is supplied', async () => {
      const { service } = await buildService();
      redisMock.setex.mockResolvedValueOnce('OK');

      await service.set('my-key', 42);

      expect(redisMock.setex).toHaveBeenCalledWith('my-key', 60, JSON.stringify(42));
    });

    it('does not throw when Redis is unavailable', async () => {
      const { service } = await buildService();
      (service as unknown as { isRedisAvailable: boolean }).isRedisAvailable = false;

      await expect(service.set('key', 'value')).resolves.toBeUndefined();
      expect(redisMock.setex).not.toHaveBeenCalled();
    });

    it('handles Redis errors gracefully without throwing', async () => {
      const { service } = await buildService();
      redisMock.setex.mockRejectedValueOnce(new Error('write error'));

      await expect(service.set('key', 'value')).resolves.toBeUndefined();
    });
  });

  // ── delete() ───────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('deletes a specific key', async () => {
      const { service } = await buildService();
      redisMock.del.mockResolvedValueOnce(1);

      await service.delete('balance:user1:1');

      expect(redisMock.del).toHaveBeenCalledWith('balance:user1:1');
    });
  });

  // ── invalidate() ───────────────────────────────────────────────────────

  describe('invalidate()', () => {
    it('scans and deletes all matching keys', async () => {
      const { service } = await buildService();
      // Simulate two SCAN pages
      redisMock.scan
        .mockResolvedValueOnce(['42', ['balance:user1:1', 'balance:user1:2']])
        .mockResolvedValueOnce(['0', ['balance:user1:3']]);
      redisMock.del.mockResolvedValue(3);

      const deleted = await service.invalidate('balance:user1:*');

      expect(redisMock.scan).toHaveBeenCalledTimes(2);
      expect(deleted).toBe(3);
    });

    it('returns 0 when no keys match', async () => {
      const { service } = await buildService();
      redisMock.scan.mockResolvedValueOnce(['0', []]);

      const deleted = await service.invalidate('balance:ghost:*');

      expect(redisMock.del).not.toHaveBeenCalled();
      expect(deleted).toBe(0);
    });

    it('returns 0 and does not throw when Redis errors', async () => {
      const { service } = await buildService();
      redisMock.scan.mockRejectedValueOnce(new Error('SCAN error'));

      await expect(service.invalidate('balance:*')).resolves.toBe(0);
    });
  });

  // ── warmBatch() ────────────────────────────────────────────────────────

  describe('warmBatch()', () => {
    it('pipelines all entries', async () => {
      const { service } = await buildService();
      const pipelineMock = { setex: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) };
      redisMock.pipeline.mockReturnValueOnce(pipelineMock);

      await service.warmBatch([
        { key: 'balance:u1:1', value: { amount: '10' } },
        { key: 'balance:u2:1', value: { amount: '20' }, ttl: 120 },
      ]);

      expect(pipelineMock.setex).toHaveBeenCalledTimes(2);
      expect(pipelineMock.exec).toHaveBeenCalled();
    });

    it('does nothing when entries array is empty', async () => {
      const { service } = await buildService();
      await service.warmBatch([]);
      expect(redisMock.pipeline).not.toHaveBeenCalled();
    });
  });

  // ── healthCheck() ──────────────────────────────────────────────────────

  describe('healthCheck()', () => {
    it('returns ok with latency when Redis responds', async () => {
      const { service } = await buildService();
      redisMock.ping.mockResolvedValueOnce('PONG');

      const result = await service.healthCheck();

      expect(result.status).toBe('ok');
      expect(typeof result.latencyMs).toBe('number');
    });

    it('returns error status when ping fails', async () => {
      const { service } = await buildService();
      redisMock.ping.mockRejectedValueOnce(new Error('timeout'));

      const result = await service.healthCheck();

      expect(result.status).toBe('error');
      expect(result.error).toBe('timeout');
    });
  });

  // ── TTL enforcement ────────────────────────────────────────────────────

  describe('TTL', () => {
    it('respects custom TTL passed to set()', async () => {
      const { service } = await buildService();
      redisMock.setex.mockResolvedValueOnce('OK');

      await service.set('k', 'v', 300);

      const [, ttlArg] = redisMock.setex.mock.calls[0];
      expect(ttlArg).toBe(300);
    });
  });
});
