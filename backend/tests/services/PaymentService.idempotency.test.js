import { jest } from '@jest/globals';

jest.unstable_mockModule('../../config/redis.js', () => ({
    default: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        quit: jest.fn(),
        isOpen: true,
        connect: jest.fn()
    },
    publish: jest.fn(),
    subClient: {
        subscribe: jest.fn(),
        quit: jest.fn(),
        isOpen: true,
        connect: jest.fn()
    },
    redisConnection: {
        status: 'ready'
    },
    recordCacheHit: jest.fn(),
    recordCacheMiss: jest.fn(),
    getCacheMetrics: jest.fn(),
    IDEMPOTENCY_PREFIX: 'idempotency:'
}));

jest.unstable_mockModule("../../config/database.js", () => ({
    default: {
        transaction: jest.fn(() => ({
            commit: jest.fn(),
            rollback: jest.fn(),
        })),
        fn: {
            now: jest.fn(() => new Date().toISOString()),
        },
        destroy: jest.fn()
    },
}));

const { default: paymentService } = await import('../../services/PaymentService.js');

describe('PaymentService - Idempotency Key Generation', () => {

    describe('_generateIdempotencyKey', () => {
        it('should generate the same key for identical inputs', () => {
            const inputs = {
                userId: 1,
                senderTag: 'alice',
                recipientTag: 'bob',
                amount: '100.5',
                asset: 'XLM',
                memo: 'test payment',
            };

            const key1 = paymentService._generateIdempotencyKey(inputs);
            const key2 = paymentService._generateIdempotencyKey(inputs);

            expect(key1).toBe(key2);
            expect(key1.startsWith('gen:')).toBe(true);
        });

        it('should generate different keys for different inputs', () => {
            const inputs1 = {
                userId: 1,
                senderTag: 'alice',
                recipientTag: 'bob',
                amount: '100.5',
                asset: 'XLM',
                memo: 'test payment',
            };

            const inputs2 = {
                ...inputs1,
                amount: '200',
            };

            const key1 = paymentService._generateIdempotencyKey(inputs1);
            const key2 = paymentService._generateIdempotencyKey(inputs2);

            expect(key1).not.toBe(key2);
        });

        it('should normalize inputs before hashing', () => {
            const inputs1 = {
                userId: 1,
                senderTag: 'ALICE',
                recipientTag: 'bob',
                amount: '100.50000',
                asset: 'xlm',
                memo: '',
            };

            const inputs2 = {
                userId: 1,
                senderTag: 'alice',
                recipientTag: 'BOB',
                amount: 100.5,
                asset: 'XLM',
                memo: '',
            };

            const key1 = paymentService._generateIdempotencyKey(inputs1);
            const key2 = paymentService._generateIdempotencyKey(inputs2);

            expect(key1).toBe(key2);
        });
    });
});
