import { jest } from '@jest/globals';
import crypto from 'crypto';

// Mock crypto.randomUUID to return deterministic values
jest.unstable_mockModule('crypto', () => ({
    randomUUID: jest.fn(() => 'test-uuid-001')
}));

const { default: DistributedLock } = await import('../utils/distributedLock.js');

describe('DistributedLock Unit Tests', () => {
    let mockRedis;

    beforeEach(() => {
        // Fresh mock Redis client per test
        mockRedis = {
            set: jest.fn(),
            eval: jest.fn()
        };
    });

    describe('lock acquisition', () => {
        it('should acquire lock when key does not exist', async () => {
            mockRedis.set.mockResolvedValue('OK');
            const lock = new DistributedLock(mockRedis);

            const identifier = await lock.acquire('user:123:txn');

            expect(identifier).toBe('test-uuid-001');
            expect(mockRedis.set).toHaveBeenCalledWith(
                'lock:user:123:txn',
                'test-uuid-001',
                { NX: true, PX: 10000 }
            );
        });

        it('should fail acquisition if lock is already held', async () => {
            mockRedis.set.mockResolvedValue(null);
            const lock = new DistributedLock(mockRedis);

            const identifier = await lock.acquire('user:123:txn', 10000, 1);

            expect(identifier).toBeNull();
        });

        it('should retry with exponential backoff on contention', async () => {
            let callCount = 0;
            mockRedis.set.mockImplementation(async () => {
                callCount++;
                if (callCount === 1) return null; // First attempt fails
                if (callCount === 2) return 'OK'; // Second attempt succeeds
                return null;
            });
            const lock = new DistributedLock(mockRedis);

            const identifier = await lock.acquire('user:123:txn', 10000, 3, 10);

            expect(identifier).toBe('test-uuid-001');
            expect(mockRedis.set.mock.calls.length).toBe(2);
        });

        it('should give up after max retries', async () => {
            mockRedis.set.mockResolvedValue(null);
            const lock = new DistributedLock(mockRedis);

            const identifier = await lock.acquire('user:123:txn', 10000, 2, 10);

            expect(identifier).toBeNull();
            expect(mockRedis.set.mock.calls.length).toBe(2);
        });

        it('should support custom TTL', async () => {
            mockRedis.set.mockResolvedValue('OK');
            const lock = new DistributedLock(mockRedis);

            await lock.acquire('user:123:txn', 5000);

            expect(mockRedis.set).toHaveBeenCalledWith(
                'lock:user:123:txn',
                'test-uuid-001',
                { NX: true, PX: 5000 }
            );
        });
    });

    describe('ownership-safe release', () => {
        it('should release lock when token matches', async () => {
            mockRedis.eval.mockResolvedValue(1);
            const lock = new DistributedLock(mockRedis);

            const released = await lock.release('user:123:txn', 'correct-token');

            expect(released).toBe(true);
            expect(mockRedis.eval).toHaveBeenCalledWith(
                expect.stringContaining('if redis.call("get", KEYS[1]) == ARGV[1]'),
                { keys: ['lock:user:123:txn'], arguments: ['correct-token'] }
            );
        });

        it('should reject release when token does not match', async () => {
            mockRedis.eval.mockResolvedValue(0);
            const lock = new DistributedLock(mockRedis);

            const released = await lock.release('user:123:txn', 'wrong-token');

            expect(released).toBe(false);
        });

        it('should use Lua script to ensure atomic comparison', async () => {
            mockRedis.eval.mockResolvedValue(1);
            const lock = new DistributedLock(mockRedis);

            await lock.release('user:123:txn', 'token-123');

            const [script] = mockRedis.eval.mock.calls[0];
            expect(script).toContain('if redis.call("get", KEYS[1]) == ARGV[1] then');
            expect(script).toContain('return redis.call("del", KEYS[1])');
        });
    });

    describe('lock expiry', () => {
        it('should set PX (millisecond expiry) on lock', async () => {
            mockRedis.set.mockResolvedValue('OK');
            const lock = new DistributedLock(mockRedis);

            await lock.acquire('user:123:txn', 15000);

            const [, , options] = mockRedis.set.mock.calls[0];
            expect(options.PX).toBe(15000);
        });

        it('should treat expired lock as acquirable (Redis auto-expires)', async () => {
            // Redis automatically deletes keys after TTL
            // If lock has expired, the next acquire() call will succeed
            mockRedis.set.mockResolvedValue('OK');
            const lock = new DistributedLock(mockRedis);

            const identifier = await lock.acquire('user:123:txn', 100);

            expect(identifier).toBe('test-uuid-001');
        });
    });

    describe('retry exhaustion', () => {
        it('should return null after exhausting retries', async () => {
            mockRedis.set.mockResolvedValue(null);
            const lock = new DistributedLock(mockRedis);

            const identifier = await lock.acquire('user:123:txn', 10000, 3, 10);

            expect(identifier).toBeNull();
            expect(mockRedis.set.mock.calls.length).toBe(3);
        });

        it('should give clear failure signal, not hang', async () => {
            mockRedis.set.mockResolvedValue(null);
            const lock = new DistributedLock(mockRedis);

            // Should complete quickly, not hang
            const start = Date.now();
            const identifier = await lock.acquire('user:123:txn', 10000, 1, 10);
            const duration = Date.now() - start;

            expect(identifier).toBeNull();
            expect(duration).toBeLessThan(500); // No real sleeps in test
        });
    });

    describe('no real network connections', () => {
        it('should not make real Redis calls', async () => {
            const lock = new DistributedLock(mockRedis);

            await lock.acquire('test:key');
            await lock.release('test:key', 'token');

            // Verify only mocked methods were called
            expect(mockRedis.set).toHaveBeenCalled();
            expect(mockRedis.eval).toHaveBeenCalled();
        });
    });

    describe('concurrency simulation', () => {
        it('should allow only one lock holder', async () => {
            let acquireCount = 0;
            mockRedis.set.mockImplementation(async (key, token, opts) => {
                acquireCount++;
                if (acquireCount === 1) return 'OK';
                return null;
            });
            const lock = new DistributedLock(mockRedis);

            const result1 = await lock.acquire('resource', 10000, 1);
            const result2 = await lock.acquire('resource', 10000, 1);

            expect(result1).not.toBeNull();
            expect(result2).toBeNull();
        });

        it('should handle lock holder releasing and new acquisition', async () => {
            let state = 'unlocked';
            mockRedis.set.mockImplementation(async (key, token, opts) => {
                if (state === 'unlocked') {
                    state = 'locked';
                    return 'OK';
                }
                return null;
            });
            mockRedis.eval.mockImplementation(async () => {
                state = 'unlocked';
                return 1;
            });
            const lock = new DistributedLock(mockRedis);

            const token1 = await lock.acquire('resource');
            expect(token1).not.toBeNull();

            const released = await lock.release('resource', token1);
            expect(released).toBe(true);

            const token2 = await lock.acquire('resource');
            expect(token2).not.toBeNull();
        });
    });
});
