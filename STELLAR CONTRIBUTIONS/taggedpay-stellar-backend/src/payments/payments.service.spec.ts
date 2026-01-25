import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import { StellarService } from '../stellar/stellar.service';
import { AccountsService } from '../accounts/accounts.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('PaymentsService', () => {
    let service: PaymentsService;
    let stellarService: StellarService;
    let accountsService: AccountsService;

    const mockStellarService = {
        sendPayment: jest.fn(),
    };

    const mockAccountsService = {
        getAccountByTag: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PaymentsService,
                { provide: StellarService, useValue: mockStellarService },
                { provide: AccountsService, useValue: mockAccountsService },
            ],
        }).compile();

        service = module.get<PaymentsService>(PaymentsService);
        stellarService = module.get<StellarService>(StellarService);
        accountsService = module.get<AccountsService>(AccountsService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('sendPayment', () => {
        const paymentDto = { fromTag: 'sender', toTag: 'receiver', amount: 50 };

        it('should successfully process a payment', async () => {
            const senderAcc = { tag: 'sender', secretKey: 'S1', publicKey: 'G1' };
            const receiverAcc = { tag: 'receiver', secretKey: 'S2', publicKey: 'G2' };

            mockAccountsService.getAccountByTag
                .mockReturnValueOnce(senderAcc)
                .mockReturnValueOnce(receiverAcc);

            mockStellarService.sendPayment.mockResolvedValue('tx-hash');

            const result = await service.sendPayment(paymentDto);

            expect(result).toEqual({
                success: true,
                hash: 'tx-hash',
                from: '@sender',
                to: '@receiver',
                amount: 50,
            });
            expect(mockStellarService.sendPayment).toHaveBeenCalledWith('S1', 'G2', '50');
        });

        it('should throw NotFoundException if sender tag is missing', async () => {
            mockAccountsService.getAccountByTag.mockReturnValueOnce(null);

            await expect(service.sendPayment(paymentDto)).rejects.toThrow(NotFoundException);
        });

        it('should throw NotFoundException if receiver tag is missing', async () => {
            mockAccountsService.getAccountByTag
                .mockReturnValueOnce({ tag: 'sender' })
                .mockReturnValueOnce(null);

            await expect(service.sendPayment(paymentDto)).rejects.toThrow(NotFoundException);
        });

        it('should throw BadRequestException if sending to self', async () => {
            mockAccountsService.getAccountByTag.mockReturnValue({ tag: 'same' });

            await expect(service.sendPayment({ fromTag: 'same', toTag: 'same', amount: 10 }))
                .rejects.toThrow(BadRequestException);
        });

        it('should throw BadRequestException if stellar transaction fails', async () => {
            mockAccountsService.getAccountByTag
                .mockReturnValueOnce({ tag: 's', secretKey: 's' })
                .mockReturnValueOnce({ tag: 'r', publicKey: 'r' });

            mockStellarService.sendPayment.mockRejectedValue(new Error('Stellar error'));

            await expect(service.sendPayment(paymentDto)).rejects.toThrow(BadRequestException);
        });
    });
});
