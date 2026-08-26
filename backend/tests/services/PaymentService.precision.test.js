import { jest } from '@jest/globals';

jest.unstable_mockModule('../../config/redis.js', () => ({
    default: {},
    publish: jest.fn(),
}));

jest.unstable_mockModule("../../config/database.js", () => ({
    default: {},
}));

const { default: paymentService } = await import('../../services/PaymentService.js');

describe('PaymentService payment precision characterization', () => {
    it('calculates fees exactly at stroop precision', () => {
        const feeInfo = paymentService.calculateFee(0.29);

        expect(feeInfo.baseFee).toBe('0.00029');
        expect(feeInfo.networkFee).toBe('0.00001');
        expect(feeInfo.fee).toBe('0.0003');
        expect(feeInfo.feeStroops).toBe('3000');
    });

    it('rejects numeric prefixes and amounts outside payment bounds', async () => {
        paymentService.resolveTag = jest.fn()
            .mockResolvedValueOnce('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
            .mockResolvedValueOnce('GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');

        await expect(paymentService.validatePayment({
            senderTag: 'alice',
            recipientTag: 'bob',
            amount: '1.2xlm',
        })).rejects.toThrow('Invalid amount');

        await expect(paymentService.validatePayment({
            senderTag: 'alice',
            recipientTag: 'bob',
            amount: '1000000.0000001',
        })).rejects.toThrow('maximum limit');

        await expect(paymentService.validatePayment({
            senderTag: 'alice',
            recipientTag: 'bob',
            amount: '1,23',
        })).rejects.toThrow('Invalid amount');
    });

    it('normalizes valid amounts without losing stroops', async () => {
        paymentService.resolveTag = jest.fn()
            .mockResolvedValueOnce('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
            .mockResolvedValueOnce('GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');

        const payment = await paymentService.validatePayment({
            senderTag: 'alice',
            recipientTag: 'bob',
            amount: '1.2300000',
        });

        expect(payment.amount).toBe('1.23');
    });
});