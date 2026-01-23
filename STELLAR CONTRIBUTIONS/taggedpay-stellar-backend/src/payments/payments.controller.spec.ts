import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
    let controller: PaymentsController;
    let service: PaymentsService;

    const mockPaymentsService = {
        sendPayment: jest.fn(),
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [PaymentsController],
            providers: [
                { provide: PaymentsService, useValue: mockPaymentsService },
            ],
        }).compile();

        controller = module.get<PaymentsController>(PaymentsController);
        service = module.get<PaymentsService>(PaymentsService);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });

    describe('sendPayment', () => {
        it('should call service.sendPayment', async () => {
            const dto = { fromTag: 's', toTag: 'r', amount: 10 };
            const expectedResult = { success: true, hash: 'hash' };
            mockPaymentsService.sendPayment.mockResolvedValue(expectedResult);

            const result = await controller.sendPayment(dto);
            expect(result).toBe(expectedResult);
            expect(service.sendPayment).toHaveBeenCalledWith(dto);
        });
    });
});
