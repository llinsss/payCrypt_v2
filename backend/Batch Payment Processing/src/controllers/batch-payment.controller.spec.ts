import { Test, TestingModule } from "@nestjs/testing";
import { BatchPaymentController } from "./batch-payment.controller";
import { BatchPaymentService } from "../services/batch-payment.service";
import { CreateBatchPaymentDto } from "../dto/batch-payment.dto";
import {
  FailureMode,
  BatchPaymentStatus,
} from "../entities/batch-payment.entity";

describe("BatchPaymentController", () => {
  let controller: BatchPaymentController;
  let service: BatchPaymentService;

  const mockBatchPaymentService = {
    createBatchPayment: jest.fn(),
    getBatchPaymentStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BatchPaymentController],
      providers: [
        {
          provide: BatchPaymentService,
          useValue: mockBatchPaymentService,
        },
      ],
    }).compile();

    controller = module.get<BatchPaymentController>(BatchPaymentController);
    service = module.get<BatchPaymentService>(BatchPaymentService);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("createBatchPayment", () => {
    it("should create a batch payment successfully", async () => {
      const createDto: CreateBatchPaymentDto = {
        payments: [
          { recipientTag: "@user1", amount: 100, asset: "XLM", memo: "Test" },
          { recipientTag: "@user2", amount: 200, asset: "XLM", memo: "Test" },
        ],
        failureMode: FailureMode.CONTINUE,
      };

      const mockResponse = {
        batchId: 1,
        status: BatchPaymentStatus.PENDING,
        totalPayments: 2,
        successfulPayments: 0,
        failedPayments: 0,
        totalAmount: "300",
        totalFees: "0.2",
        results: [],
        createdAt: new Date(),
      };

      mockBatchPaymentService.createBatchPayment.mockResolvedValue(
        mockResponse,
      );

      const req = { user: { id: 1 } };
      const result = await controller.createBatchPayment(createDto, req);

      expect(result).toEqual(mockResponse);
      expect(service.createBatchPayment).toHaveBeenCalledWith(1, createDto);
    });

    it("should handle request without authenticated user", async () => {
      const createDto: CreateBatchPaymentDto = {
        payments: [{ recipientTag: "@user1", amount: 100, asset: "XLM" }],
        failureMode: FailureMode.CONTINUE,
      };

      const mockResponse = {
        batchId: 1,
        status: BatchPaymentStatus.PENDING,
        totalPayments: 1,
        successfulPayments: 0,
        failedPayments: 0,
        totalAmount: "100",
        totalFees: "0.1",
        results: [],
        createdAt: new Date(),
      };

      mockBatchPaymentService.createBatchPayment.mockResolvedValue(
        mockResponse,
      );

      const req = {}; // No user
      const result = await controller.createBatchPayment(createDto, req);

      expect(result).toEqual(mockResponse);
      expect(service.createBatchPayment).toHaveBeenCalledWith(1, createDto); // Falls back to user ID 1
    });
  });

  describe("getBatchPaymentStatus", () => {
    it("should return batch payment status", async () => {
      const mockResponse = {
        batchId: 1,
        status: BatchPaymentStatus.COMPLETED,
        totalPayments: 2,
        successfulPayments: 2,
        failedPayments: 0,
        totalAmount: "300",
        totalFees: "0.2",
        results: [
          { index: 0, status: "success" as const, transactionId: 1 },
          { index: 1, status: "success" as const, transactionId: 2 },
        ],
        createdAt: new Date(),
        completedAt: new Date(),
      };

      mockBatchPaymentService.getBatchPaymentStatus.mockResolvedValue(
        mockResponse,
      );

      const req = { user: { id: 1 } };
      const result = await controller.getBatchPaymentStatus("1", req);

      expect(result).toEqual(mockResponse);
      expect(service.getBatchPaymentStatus).toHaveBeenCalledWith(1, 1);
    });

    it("should parse batch ID correctly", async () => {
      const mockResponse = {
        batchId: 123,
        status: BatchPaymentStatus.PROCESSING,
        totalPayments: 5,
        successfulPayments: 3,
        failedPayments: 0,
        totalAmount: "500",
        totalFees: "0.5",
        results: [],
        createdAt: new Date(),
      };

      mockBatchPaymentService.getBatchPaymentStatus.mockResolvedValue(
        mockResponse,
      );

      const req = { user: { id: 1 } };
      const result = await controller.getBatchPaymentStatus("123", req);

      expect(result).toEqual(mockResponse);
      expect(service.getBatchPaymentStatus).toHaveBeenCalledWith(123, 1);
    });
  });
});
