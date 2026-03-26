import { jest } from "@jest/globals";

// Mock dependencies
jest.unstable_mockModule("../../config/database.js", () => ({
    default: {
        transaction: jest.fn(() => ({
            commit: jest.fn(),
            rollback: jest.fn(),
        })),
        fn: {
            now: jest.fn(() => new Date().toISOString()),
        },
    },
}));

jest.unstable_mockModule("../../models/BatchPayment.js", () => ({
    default: {
        create: jest.fn(),
        findById: jest.fn(),
        update: jest.fn(),
        getDetailedByIdForUser: jest.fn(),
    },
}));

jest.unstable_mockModule("../../services/PaymentService.js", () => ({
    default: {
        resolveTag: jest.fn(),
        getBalance: jest.fn(),
        calculateFee: jest.fn(),
        submitTransaction: jest.fn(),
        processPayment: jest.fn(),
        server: {
            loadAccount: jest.fn(),
        },
        checkMultiSigRequirement: jest.fn(() => ({ required: false })),
    },
}));

jest.unstable_mockModule("../../models/Token.js", () => ({
    default: {
        findBySymbol: jest.fn(),
    },
}));

jest.unstable_mockModule("../../models/Transaction.js", () => ({
    default: {
        findById: jest.fn(),
        update: jest.fn(),
    },
}));

jest.unstable_mockModule("../../queues/batchPaymentQueue.js", () => ({
    default: {
        add: jest.fn(),
    },
}));

const { default: BatchPaymentService } = await import("../../services/BatchPaymentService.js");
const { default: BatchPayment } = await import("../../models/BatchPayment.js");
const { default: PaymentService } = await import("../../services/PaymentService.js");
const { default: Token } = await import("../../models/Token.js");
const { default: batchPaymentQueue } = await import("../../queues/batchPaymentQueue.js");

describe("BatchPaymentService", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        BatchPayment.update.mockImplementation((id, data) => Promise.resolve({ id, reference: "REF-123", ...data }));
    });

    describe("createBatchPayment", () => {
        it("should process a small batch immediately", async () => {
            const payments = [{ recipientTag: "user2", amount: 10 }];
            const userId = 1;
            const senderTag = "user1";

            BatchPayment.create.mockResolvedValue({ id: 123, reference: "REF-123", status: "pending", total_items: 1 });
            Token.findBySymbol.mockResolvedValue({ id: 1, symbol: "XLM", price: 1 });
            PaymentService.resolveTag.mockResolvedValue("G123...");
            PaymentService.server.loadAccount.mockResolvedValue({});
            PaymentService.calculateFee.mockReturnValue({ fee: 0.1 });
            PaymentService.getBalance.mockResolvedValue(100);

            // We'll mock processAtomicBatch via spy if it was a real class instance, 
            // but since it's an object we can just mock its internal call or let it run.
            // For simplicity, let's assume atomic=false to test processNonAtomicBatch
            const result = await BatchPaymentService.createBatchPayment({
                userId,
                senderTag,
                payments,
                atomic: false,
                senderSecret: "S123...",
            });

            expect(BatchPayment.create).toHaveBeenCalled();
            expect(batchPaymentQueue.add).not.toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it("should queue a large batch (>20 payments)", async () => {
            const payments = Array(25).fill({ recipientTag: "user2", amount: 1 });
            const userId = 1;
            const senderTag = "user1";

            BatchPayment.create.mockResolvedValue({ id: 124, reference: "REF-124", status: "pending", total_items: 25 });

            const result = await BatchPaymentService.createBatchPayment({
                userId,
                senderTag,
                payments,
                atomic: false,
                senderSecret: "S123...",
            });

            expect(batchPaymentQueue.add).toHaveBeenCalledWith("process-batch", expect.any(Object));
            expect(result.httpStatus).toBe(202);
        });
    });

    describe("processNonAtomicBatch parallel execution", () => {
        it("should process items in parallel", async () => {
            const batch = { id: 125, total_items: 2, reference: "REF-125" };
            const preparedBatch = {
                senderAddress: "G-SENDER",
                validItems: [
                    { index: 0, recipientTag: "user2", recipientAddress: "G2", amount: 10, totalCost: 10.1, feeInfo: { fee: 0.1 } },
                    { index: 1, recipientTag: "user3", recipientAddress: "G3", amount: 20, totalCost: 20.1, feeInfo: { fee: 0.1 } },
                ],
                failures: [],
            };

            PaymentService.getBalance.mockResolvedValue(100);
            PaymentService.processPayment.mockResolvedValue({ transactionId: 1, fee: 0.1, txHash: "HASH" });
            BatchPayment.update.mockResolvedValue(batch);
            BatchPayment.getDetailedByIdForUser.mockResolvedValue(batch);

            const result = await BatchPaymentService.processNonAtomicBatch({
                batch,
                preparedBatch,
                userId: 1,
                senderTag: "user1",
                asset: "XLM",
                senderSecret: "S-SENDER",
            });

            expect(PaymentService.processPayment).toHaveBeenCalledTimes(2);
            expect(result.success).toBe(true);
        });
    });
});
