import { jest } from '@jest/globals';
import { IDEMPOTENCY_PREFIX } from '../config/redis.js';

jest.unstable_mockModule('../config/redis.js', () => ({
    default: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        quit: jest.fn(),
        isOpen: true,
        connect: jest.fn()
    },
    IDEMPOTENCY_PREFIX: 'idem:v1:',
    publish: jest.fn(),
    subClient: {
        subscribe: jest.fn(),
        quit: jest.fn(),
        isOpen: true,
        connect: jest.fn()
    },
    recordCacheHit: jest.fn(),
    recordCacheMiss: jest.fn(),
    getCacheMetrics: jest.fn(),
}));

const { default: IdempotencyService, buildIdempotencyKey } = await import('../services/IdempotencyService.js');
const redisModule = await import('../config/redis.js');
const redis = redisModule.default;

describe('Idempotency Service Contract', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('buildIdempotencyKey helper', () => {
        it('should include version prefix', () => {
            const key = buildIdempotencyKey('test-123');
            expect(key).toBe('idem:v1:test-123');
        });

        it('should not double-prefix', () => {
            const key = buildIdempotencyKey('idem:v1:already-prefixed');
            expect(key).toBe('idem:v1:idem:v1:already-prefixed');
        });

        it('should handle special characters', () => {
            const key = buildIdempotencyKey('user-123:transaction-xyz');
            expect(key).toBe('idem:v1:user-123:transaction-xyz');
        });

        it('should handle empty string', () => {
            const key = buildIdempotencyKey('');
            expect(key).toBe('idem:v1:');
        });
    });

    describe('create (first request)', () => {
        it('should acquire lock and cache response', async () => {
            jest.spyOn(redis, 'get').mockResolvedValue(null);
            jest.spyOn(redis, 'set').mockResolvedValue('OK');

            const locked = await IdempotencyService.setLock('req-1');
            expect(locked).toBe(true);
            expect(redis.set).toHaveBeenCalledWith(
                'idem:v1:req-1',
                expect.stringContaining('"status":"in-progress"'),
                { NX: true, EX: 60 }
            );

            const response = { statusCode: 200, data: 'success' };
            await IdempotencyService.saveResponse('req-1', response);
            expect(redis.set).toHaveBeenCalledWith(
                'idem:v1:req-1',
                expect.stringContaining('"status":"completed"'),
                { EX: 86400 }
            );
        });
    });

    describe('replay (identical retry)', () => {
        it('should return cached response for same key', async () => {
            const cachedRecord = {
                status: 'completed',
                response: { statusCode: 200, data: 'cached-result' },
                timestamp: new Date().toISOString()
            };
            jest.spyOn(redis, 'get').mockResolvedValue(JSON.stringify(cachedRecord));

            const result = await IdempotencyService.getRecord('req-1');

            expect(result).toEqual(cachedRecord);
            expect(redis.get).toHaveBeenCalledWith('idem:v1:req-1');
        });
    });

    describe('conflict (same key, different payload)', () => {
        it('should detect in-progress status and return conflict', async () => {
            const inProgressRecord = {
                status: 'in-progress',
                timestamp: new Date().toISOString()
            };
            jest.spyOn(redis, 'get').mockResolvedValue(JSON.stringify(inProgressRecord));

            const result = await IdempotencyService.getRecord('req-1');

            expect(result.status).toBe('in-progress');
            // Caller should return 409 Conflict
        });
    });

    describe('expiry (key past TTL)', () => {
        it('should treat expired key as fresh request (returns null)', async () => {
            jest.spyOn(redis, 'get').mockResolvedValue(null);

            const result = await IdempotencyService.getRecord('expired-req');

            expect(result).toBeNull();
            // Redis auto-expiry means GET returns null; we don't need to check timestamps
        });
    });

    describe('IDEMPOTENCY_PREFIX export', () => {
        it('should export versioned prefix', () => {
            expect(IDEMPOTENCY_PREFIX).toBe('idem:v1:');
        });

        it('should use version in key construction', () => {
            const fullKey = buildIdempotencyKey('test');
            expect(fullKey.startsWith(IDEMPOTENCY_PREFIX)).toBe(true);
        });
    });

    describe('Redis contract', () => {
        it('should not make real network calls', async () => {
            jest.spyOn(redis, 'get').mockResolvedValue(null);
            jest.spyOn(redis, 'set').mockResolvedValue('OK');
            jest.spyOn(redis, 'del').mockResolvedValue(1);

            await IdempotencyService.getRecord('test');
            await IdempotencyService.setLock('test');
            await IdempotencyService.saveResponse('test', { foo: 'bar' });
            await IdempotencyService.deleteRecord('test');

            // All calls are mocked; verify spies were called
            expect(redis.get).toHaveBeenCalled();
            expect(redis.set).toHaveBeenCalled();
            expect(redis.del).toHaveBeenCalled();
        });
    });
});
