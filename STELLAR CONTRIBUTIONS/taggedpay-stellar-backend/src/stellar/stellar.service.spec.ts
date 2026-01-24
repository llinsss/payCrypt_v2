import { Test, TestingModule } from '@nestjs/testing';
import { StellarService } from './stellar.service';
import * as StellarSdk from '@stellar/stellar-sdk';
import { stellarConfig } from '../config/stellar.config';

// Mock the entire Stellar SDK
jest.mock('@stellar/stellar-sdk', () => {
    return {
        Horizon: {
            Server: jest.fn().mockImplementation(() => ({
                loadAccount: jest.fn(),
                submitTransaction: jest.fn(),
                transactions: jest.fn().mockReturnValue({
                    forAccount: jest.fn().mockReturnThis(),
                    limit: jest.fn().mockReturnThis(),
                    order: jest.fn().mockReturnThis(),
                    call: jest.fn(),
                }),
            })),
        },
        Keypair: {
            random: jest.fn().mockImplementation(() => ({
                publicKey: () => 'GB7...123',
                secret: () => 'SC2...456',
            })),
            fromSecret: jest.fn().mockImplementation(() => ({
                publicKey: () => 'GB7...123',
                secret: () => 'SC2...456',
            })),
        },
        TransactionBuilder: jest.fn().mockImplementation(() => ({
            addOperation: jest.fn().mockReturnThis(),
            setTimeout: jest.fn().mockReturnThis(),
            build: jest.fn().mockReturnValue({
                sign: jest.fn(),
                hash: () => 'tx-hash',
            }),
        })),
        Networks: {
            TESTNET: 'Test SDF Network ; September 2015',
        },
        BASE_FEE: '100',
        Asset: {
            native: jest.fn(),
        },
        Operation: {
            payment: jest.fn(),
            accountMerge: jest.fn(),
        },
        TimeoutInfinite: 0,
        NotFoundError: class extends Error { },
    };
});

// Mock fetch
global.fetch = jest.fn();

describe('StellarService', () => {
    let service: StellarService;
    let mockServer: any;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [StellarService],
        }).compile();

        service = module.get<StellarService>(StellarService);
        mockServer = (service as any).server;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('generateKeypair', () => {
        it('should return a new public and secret keypair', () => {
            const result = service.generateKeypair();
            expect(result).toEqual({
                publicKey: 'GB7...123',
                secretKey: 'SC2...456',
            });
            expect(StellarSdk.Keypair.random).toHaveBeenCalled();
        });
    });

    describe('fundAccount', () => {
        it('should return true when friendbot transaction is successful', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ hash: 'test-hash' }),
            });

            const result = await service.fundAccount('GB7...123');
            expect(result).toBe(true);
            expect(global.fetch).toHaveBeenCalledWith(`${stellarConfig.friendbotUrl}?addr=GB7...123`);
        });

        it('should return false when friendbot returns an error', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                text: async () => 'Error message',
            });

            const result = await service.fundAccount('GB7...123');
            expect(result).toBe(false);
        });
    });

    describe('getBalance', () => {
        it('should return the XLM balance of an account', async () => {
            const mockAccount = {
                balances: [
                    { asset_type: 'native', balance: '100.5' },
                ],
            };
            mockServer.loadAccount.mockResolvedValueOnce(mockAccount);

            const result = await service.getBalance('GB7...123');
            expect(result).toBe('100.5');
        });

        it('should return null when account is not found', async () => {
            mockServer.loadAccount.mockRejectedValueOnce(new (StellarSdk as any).NotFoundError('Not found'));

            const result = await service.getBalance('GB7...123');
            expect(result).toBeNull();
        });
    });

    describe('accountExists', () => {
        it('should return true if account exists', async () => {
            mockServer.loadAccount.mockResolvedValueOnce({});
            const result = await service.accountExists('GB7...123');
            expect(result).toBe(true);
        });

        it('should return false if account does not exist', async () => {
            mockServer.loadAccount.mockRejectedValueOnce(new (StellarSdk as any).NotFoundError('Not found'));
            const result = await service.accountExists('GB7...123');
            expect(result).toBe(false);
        });
    });

    describe('sendPayment', () => {
        it('should successfully send a payment and return hash', async () => {
            mockServer.loadAccount.mockResolvedValueOnce({
                sequenceNumber: () => '1',
            });
            mockServer.submitTransaction.mockResolvedValueOnce({ successful: true, hash: 'tx-hash' });

            const result = await service.sendPayment('S...SEC', 'RECEIVER_PUB', '10');

            expect(result).toBe('tx-hash');
            expect(mockServer.submitTransaction).toHaveBeenCalled();
        });

        it('should throw error if payment fails', async () => {
            mockServer.loadAccount.mockRejectedValueOnce(new Error('Stellar error'));

            await expect(service.sendPayment('S...SEC', 'R_PUB', '10')).rejects.toThrow('Stellar error');
        });
    });
});
