import { jest, describe, it, expect, beforeEach } from "@jest/globals";

let processor;
jest.unstable_mockModule("bullmq", () => ({
  Worker: jest.fn(function (name, fn) {
    if (name === "scheduled-payment-executor") processor = fn;
    this.on = jest.fn();
  }),
  Queue: jest.fn(function () {
    this.add = jest.fn().mockResolvedValue({});
  }),
}));
jest.unstable_mockModule("../config/redis.js", () => ({ redisConnection: {} }));
jest.unstable_mockModule("../config/database.js", () => ({ default: jest.fn() }));
jest.unstable_mockModule("../models/Notification.js", () => ({ default: { create: jest.fn() } }));
jest.unstable_mockModule("../models/AuditLog.js", () => ({
  default: { create: jest.fn().mockResolvedValue({ id: 99 }) },
}));
jest.unstable_mockModule("../services/PaymentService.js", () => ({
  default: { processPayment: jest.fn().mockResolvedValue({ success: true }) },
}));
jest.unstable_mockModule("../services/KeyVaultService.js", () => ({
  default: { withUserSecrets: jest.fn((userId, fn) => fn(["secret"])) },
}));
jest.unstable_mockModule("../services/NotificationService.js", () => ({
  default: { sendToUser: jest.fn().mockResolvedValue() },
}));
jest.unstable_mockModule("../services/external/smtp.js", () => ({ sendEmail: jest.fn() }));
jest.unstable_mockModule("../workers/apiKeyRotationWorker.js", () => ({ apiKeyRotationQueue: null }));
jest.unstable_mockModule("../workers/reconciliation.js", () => ({
  reconciliationQueue: null,
  registerReconciliationJob: jest.fn().mockResolvedValue(),
}));
jest.unstable_mockModule("../utils/bullmqAlerts.js", () => ({ default: jest.fn() }));

jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "warn").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});

const { default: ScheduledPayment } = await import("../models/ScheduledPayment.js");
const { default: PaymentService } = await import("../services/PaymentService.js");
const { default: NotificationService } = await import("../services/NotificationService.js");
await import("../workers/scheduler.js");

const payment = {
  id: 5,
  user_id: 1,
  amount: "10",
  asset: "XLM",
  recipient_tag: "bob",
  scheduled_at: new Date("2026-01-01T00:00:00Z"),
};

describe("scheduled payment execution worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(ScheduledPayment, "claimDuePayments").mockResolvedValue([payment]);
    jest.spyOn(ScheduledPayment, "completeClaim").mockResolvedValue(true);
    jest.spyOn(ScheduledPayment, "update").mockResolvedValue({});
  });

  it("claims due payments atomically instead of reading them unlocked", async () => {
    await processor({});

    expect(ScheduledPayment.claimDuePayments).toHaveBeenCalledWith({ workerId: expect.any(String) });
    expect(ScheduledPayment.update).not.toHaveBeenCalled();
  });

  it("executes with a stable idempotency key and completes under the same claim", async () => {
    const result = await processor({});

    expect(PaymentService.processPayment).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: `scheduled-payment:5:${payment.scheduled_at.getTime()}` })
    );
    const [{ workerId }] = ScheduledPayment.claimDuePayments.mock.calls[0];
    expect(ScheduledPayment.completeClaim).toHaveBeenCalledWith(5, workerId);
    expect(NotificationService.sendToUser).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ processed: 1, failed: 0 });
  });

  it("uses the same worker id for every run of this process", async () => {
    await processor({});
    await processor({});

    const [[first], [second]] = ScheduledPayment.claimDuePayments.mock.calls;
    expect(first.workerId).toBe(second.workerId);
  });

  it("leaves completion and notification to the new owner when the claim was lost", async () => {
    ScheduledPayment.completeClaim.mockResolvedValue(false);

    const result = await processor({});

    expect(NotificationService.sendToUser).not.toHaveBeenCalled();
    expect(result).toMatchObject({ processed: 0, failed: 0 });
  });
});
