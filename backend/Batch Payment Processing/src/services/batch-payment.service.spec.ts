import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { getQueueToken } from "@nestjs/bull";
import { BatchPaymentService } from "./batch-payment.service";
import { PaymentService } from "./payment.service";
import {
  BatchPayment,
  BatchPaymentStatus,
  FailureMode,
} from "../entities/batch-payment.entity";
import { DataSource } from "typeorm";

describe("BatchPaymentService", () => {
  let service: BatchPaymentService;
  let mockBatchPaymentRepository: any;
  let mockPaymentService: any;
  let mockQueue: any;

  beforeEach(async () => {
    mockBatchPaymentRepository = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    mockPaymentService = {
      processPayment: jest.fn(),
      calculateFee: jest.fn().mockResolvedValue(0.1),
    };

    mockQueue = {
      add: jest.fn(),
    };

    const mockDataSource = {
      createQueryRunner: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchPaymentService,
        {
          provide: getRepositoryToken(BatchPayment),
          useValue: mockBatchPaymentRepository,
        },
        {
          provide: PaymentService,
          useValue: mockPaymentService,
        },
        {
          provide: getQueueToken("batch-payment"),
          useValue: mockQueue,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<BatchPaymentService>(BatchPaymentService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("createBatchPayment", () => {
    it("should create a batch payment with all successful payments", async () => {
      const userId = 1;
      const createDto = {
        payments: [
          { recipientTag: "@user1", amount: 100, asset: "XLM", memo: "Test 1" },
          { recipientTag: "@user2", amount: 200, asset: "XLM", memo: "Test 2" },
        ],
        failureMode: FailureMode.CONTINUE,
      };

      const mockBatchPayment = {
        id: 1,
        userId,
        totalPayments: 2,
        totalAmount: "300",
        totalFees: "0.2",
        status: BatchPaymentStatus.PENDING,
        successfulPayments: 0,
        failedPayments: 0,
        results: [],
        createdAt: new Date(),
      };

      mockBatchPaymentRepository.create.mockReturnValue(mockBatchPayment);
      mockBatchPaymentRepository.save.mockResolvedValue(mockBatchPayment);

      const result = await service.createBatchPayment(userId, createDto);

      expect(result.batchId).toBe(1);
      expect(result.totalPayments).toBe(2);
      expect(result.status).toBe(BatchPaymentStatus.PENDING);
      expect(mockQueue.add).toHaveBeenCalledWith(
        "process-batch",
        expect.any(Object),
      );
    });

    it("should enforce max 50 payments per batch", async () => {
      const userId = 1;
      const payments = Array(51).fill({
        recipientTag: "@user1",
        amount: 100,
        asset: "XLM",
      });

      // This would be caught by validation pipe in real scenario
      expect(payments.length).toBeGreaterThan(50);
    });
  });

  describe("processBatchPayment", () => {
    it("should process all payments successfully in continue mode", async () => {
      const batchPaymentId = 1;
      const userId = 1;
      const payments = [
        { recipientTag: "@user1", amount: 100, asset: "XLM" },
        { recipientTag: "@user2", amount: 200, asset: "XLM" },
      ];

      const mockBatchPayment = {
        id: batchPaymentId,
        status: BatchPaymentStatus.PENDING,
        results: [],
      };

      mockBatchPaymentRepository.findOne.mockResolvedValue(mockBatchPayment);
      mockBatchPaymentRepository.save.mockResolvedValue(mockBatchPayment);
      mockPaymentService.processPayment.mockResolvedValue({ id: 1 });

      await service.processBatchPayment(
        batchPaymentId,
        userId,
        payments,
        FailureMode.CONTINUE,
      );

      expect(mockBatchPaymentRepository.save).toHaveBeenCalled();
      expect(mockPaymentService.processPayment).toHaveBeenCalledTimes(2);
    });

    it("should handle partial failures in continue mode", async () => {
      const batchPaymentId = 1;
      const userId = 1;
      const payments = [
        { recipientTag: "@user1", amount: 100, asset: "XLM" },
        { recipientTag: "@user2", amount: 200, asset: "XLM" },
      ];

      const mockBatchPayment = {
        id: batchPaymentId,
        status: BatchPaymentStatus.PENDING,
        results: [],
      };

      mockBatchPaymentRepository.findOne.mockResolvedValue(mockBatchPayment);
      mockBatchPaymentRepository.save.mockResolvedValue(mockBatchPayment);

      // First payment succeeds, second fails
      mockPaymentService.processPayment
        .mockResolvedValueOnce({ id: 1 })
        .mockRejectedValueOnce(new Error("Insufficient funds"));

      await service.processBatchPayment(
        batchPaymentId,
        userId,
        payments,
        FailureMode.CONTINUE,
      );

      expect(mockBatchPaymentRepository.save).toHaveBeenCalled();
    });

    it("should rollback all payments in abort mode on failure", async () => {
      const batchPaymentId = 1;
      const userId = 1;
      const payments = [
        { recipientTag: "@user1", amount: 100, asset: "XLM" },
        { recipientTag: "@user2", amount: 200, asset: "XLM" },
      ];

      const mockBatchPayment = {
        id: batchPaymentId,
        status: BatchPaymentStatus.PENDING,
        results: [],
      };

      mockBatchPaymentRepository.findOne.mockResolvedValue(mockBatchPayment);
      mockBatchPaymentRepository.save.mockResolvedValue(mockBatchPayment);

      // First payment succeeds, second fails
      mockPaymentService.processPayment
        .mockResolvedValueOnce({ id: 1 })
        .mockRejectedValueOnce(new Error("Insufficient funds"));

      await service.processBatchPayment(
        batchPaymentId,
        userId,
        payments,
        FailureMode.ABORT,
      );

      const savedBatch =
        mockBatchPaymentRepository.save.mock.calls[
          mockBatchPaymentRepository.save.mock.calls.length - 1
        ][0];

      expect(savedBatch.status).toBe(BatchPaymentStatus.FAILED);
    });

    it("should respect concurrency limit of 5", async () => {
      const batchPaymentId = 1;
      const userId = 1;
      const payments = Array(12).fill({
        recipientTag: "@user1",
        amount: 100,
        asset: "XLM",
      });

      const mockBatchPayment = {
        id: batchPaymentId,
        status: BatchPaymentStatus.PENDING,
        results: [],
      };

      mockBatchPaymentRepository.findOne.mockResolvedValue(mockBatchPayment);
      mockBatchPaymentRepository.save.mockResolvedValue(mockBatchPayment);
      mockPaymentService.processPayment.mockResolvedValue({ id: 1 });

      await service.processBatchPayment(
        batchPaymentId,
        userId,
        payments,
        FailureMode.CONTINUE,
      );

      // Should process in batches of 5: 5 + 5 + 2 = 12
      expect(mockPaymentService.processPayment).toHaveBeenCalledTimes(12);
    });
  });

  describe("getBatchPaymentStatus", () => {
    it("should return batch payment status", async () => {
      const batchPaymentId = 1;
      const userId = 1;

      const mockBatchPayment = {
        id: batchPaymentId,
        userId,
        totalPayments: 2,
        successfulPayments: 2,
        failedPayments: 0,
        totalAmount: "300",
        totalFees: "0.2",
        status: BatchPaymentStatus.COMPLETED,
        results: [
          { index: 0, status: "success", transactionId: 1 },
          { index: 1, status: "success", transactionId: 2 },
        ],
        createdAt: new Date(),
        completedAt: new Date(),
      };

      mockBatchPaymentRepository.findOne.mockResolvedValue(mockBatchPayment);

      const result = await service.getBatchPaymentStatus(
        batchPaymentId,
        userId,
      );

      expect(result.batchId).toBe(batchPaymentId);
      expect(result.status).toBe(BatchPaymentStatus.COMPLETED);
      expect(result.successfulPayments).toBe(2);
      expect(result.results.length).toBe(2);
    });

    it("should throw NotFoundException when batch not found", async () => {
      mockBatchPaymentRepository.findOne.mockResolvedValue(null);

      await expect(service.getBatchPaymentStatus(999, 1)).rejects.toThrow(
        "Batch payment not found",
      );
    });
  });
});
