import { Test, TestingModule } from '@nestjs/testing';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { NotFoundException } from '@nestjs/common';

describe('AccountsController', () => {
    let controller: AccountsController;
    let service: AccountsService;

    const mockAccountsService = {
        createAccount: jest.fn(),
        getAccountByTag: jest.fn(),
        isTagAvailable: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [AccountsController],
            providers: [
                { provide: AccountsService, useValue: mockAccountsService },
            ],
        }).compile();

        controller = module.get<AccountsController>(AccountsController);
        service = module.get<AccountsService>(AccountsService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('createAccount', () => {
        it('should call service.createAccount', async () => {
            const dto = { tag: 'test', initialBalance: 10 };
            const expectedResult = { success: true, data: {} as any };
            mockAccountsService.createAccount.mockResolvedValue(expectedResult);

            const result = await controller.createAccount(dto);
            expect(result).toBe(expectedResult);
            expect(service.createAccount).toHaveBeenCalledWith(dto);
        });
    });

    describe('getAccountByTag', () => {
        it('should return account data if found', async () => {
            const mockDate = new Date();
            const mockAccount = { tag: 'test', publicKey: 'G...', secretKey: 'S...', createdAt: mockDate };
            mockAccountsService.getAccountByTag.mockReturnValue(mockAccount);

            const result = await controller.getAccountByTag('test');
            expect(result).toEqual({
                success: true,
                data: {
                    tag: '@test',
                    publicKey: 'G...',
                    createdAt: mockDate
                }
            });
        });

        it('should throw NotFoundException if account not found', async () => {
            mockAccountsService.getAccountByTag.mockReturnValue(undefined);
            await expect(controller.getAccountByTag('none')).rejects.toThrow(NotFoundException);
        });
    });

    describe('checkTagAvailability', () => {
        it('should return availability status', async () => {
            mockAccountsService.isTagAvailable.mockReturnValue(true);
            const result = await controller.checkTagAvailability('new');
            expect(result).toEqual({ available: true, tag: '@new' });
        });
    });
});
