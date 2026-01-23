import { Test, TestingModule } from '@nestjs/testing';
import { AccountsService } from './accounts.service';
import { StellarService } from '../stellar/stellar.service';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';

describe('AccountsService', () => {
    let service: AccountsService;
    let stellarService: StellarService;

    const mockStellarService = {
        generateKeypair: jest.fn(),
        fundAccount: jest.fn(),
        getBalance: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AccountsService,
                { provide: StellarService, useValue: mockStellarService },
            ],
        }).compile();

        service = module.get<AccountsService>(AccountsService);
        stellarService = module.get<StellarService>(StellarService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('createAccount', () => {
        const createDto = { tag: 'testtag', initialBalance: 0 };

        it('should successfully create an account', async () => {
            mockStellarService.generateKeypair.mockReturnValue({
                publicKey: 'G...PUB',
                secretKey: 'S...SEC',
            });
            mockStellarService.fundAccount.mockResolvedValue(true);
            mockStellarService.getBalance.mockResolvedValue('10000');

            const result = await service.createAccount(createDto);

            expect(result.success).toBe(true);
            expect(result.data.tag).toBe('@testtag');
            expect(result.data.publicKey).toBe('G...PUB');
            expect(service.isTagAvailable('testtag')).toBe(false);
        });

        it('should throw ConflictException if tag is already taken', async () => {
            // Pre-seed the map
            (service as any).tagMap.set('testtag', {});

            await expect(service.createAccount(createDto)).rejects.toThrow(ConflictException);
        });

        it('should throw InternalServerErrorException if funding fails', async () => {
            mockStellarService.generateKeypair.mockReturnValue({
                publicKey: 'G...PUB',
                secretKey: 'S...SEC',
            });
            mockStellarService.fundAccount.mockResolvedValue(false);

            await expect(service.createAccount(createDto)).rejects.toThrow(InternalServerErrorException);
        });

        it('should throw InternalServerErrorException if balance check fails', async () => {
            mockStellarService.generateKeypair.mockReturnValue({
                publicKey: 'G...PUB',
                secretKey: 'S...SEC',
            });
            mockStellarService.fundAccount.mockResolvedValue(true);
            mockStellarService.getBalance.mockResolvedValue(null);

            await expect(service.createAccount(createDto)).rejects.toThrow(InternalServerErrorException);
        });
    });

    describe('isTagAvailable', () => {
        it('should return true if tag is not in use', () => {
            expect(service.isTagAvailable('newtag')).toBe(true);
        });

        it('should return false if tag is in use (case-insensitive)', () => {
            (service as any).tagMap.set('existing', {});
            expect(service.isTagAvailable('EXISTING')).toBe(false);
        });
    });

    describe('getAccountByTag', () => {
        it('should return account details if tag exists', () => {
            const account = { tag: 'user', publicKey: 'G...', secretKey: 'S...', createdAt: new Date() };
            (service as any).tagMap.set('user', account);

            const result = service.getAccountByTag('@user');
            expect(result).toEqual(account);
        });

        it('should return undefined if tag does not exist', () => {
            expect(service.getAccountByTag('none')).toBeUndefined();
        });
    });

    describe('getAllAccounts', () => {
        it('should return all accounts without secret keys', () => {
            const account1 = { tag: 'user1', publicKey: 'G1', secretKey: 'S1', createdAt: new Date() };
            const account2 = { tag: 'user2', publicKey: 'G2', secretKey: 'S2', createdAt: new Date() };
            (service as any).tagMap.set('user1', account1);
            (service as any).tagMap.set('user2', account2);

            const result = service.getAllAccounts();
            expect(result.length).toBe(2);
            expect(result[0]).not.toHaveProperty('secretKey');
            expect(result[0].tag).toBe('user1');
        });
    });
});
