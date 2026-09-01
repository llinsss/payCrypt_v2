import { jest } from "@jest/globals";

const mockWebhookEvent = {
  findById: jest.fn(),
  claimForManualRetry: jest.fn(),
  releaseManualRetry: jest.fn(),
};
const mockWebhook = { findById: jest.fn() };
const mockDelivery = { executeDelivery: jest.fn() };
const mockAuditLog = { create: jest.fn() };

jest.unstable_mockModule("../models/WebhookEvent.js", () => ({ default: mockWebhookEvent }));
jest.unstable_mockModule("../models/Webhook.js", () => ({ default: mockWebhook }));
jest.unstable_mockModule("../services/WebhookDeliveryService.js", () => ({ default: mockDelivery }));
jest.unstable_mockModule("../models/AuditLog.js", () => ({ default: mockAuditLog }));

const { retryDeadLetter } = await import("../controllers/webhookAdminController.js");

function makeReq(overrides = {}) {
  return {
    params: { event_id: "77" },
    query: {},
    user: { id: 9 },
    ip: "10.0.0.1",
    method: "POST",
    originalUrl: "/api/admin/webhooks/dlq/77/retry",
    get: () => "jest-agent",
    ...overrides,
  };
}

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

const deadLetterEvent = {
  id: 77,
  webhook_id: 5,
  status: "dead_letter",
  payload: JSON.stringify({ event: "payment.completed" }),
  idempotency_key: "evt-key-77",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockWebhookEvent.findById.mockResolvedValue({ ...deadLetterEvent });
  mockWebhook.findById.mockResolvedValue({ id: 5, is_active: true, url: "https://x.test/hook", secret: "s" });
  mockWebhookEvent.claimForManualRetry.mockResolvedValue(1);
  mockWebhookEvent.releaseManualRetry.mockResolvedValue(1);
  mockDelivery.executeDelivery.mockResolvedValue(true);
  mockAuditLog.create.mockResolvedValue({ id: 1 });
});

describe("retryDeadLetter — idempotent & auditable manual DLQ retries (issue #581)", () => {
  it("claims the event atomically and records a 'delivered' audit entry with the actor", async () => {
    const req = makeReq();
    const res = makeRes();

    await retryDeadLetter(req, res);

    expect(mockWebhookEvent.claimForManualRetry).toHaveBeenCalledWith(77);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 9,
        action: "webhook_dlq_retry",
        resource: "webhook_event",
        resourceId: "77",
        details: expect.objectContaining({ outcome: "delivered" }),
      }),
    );
  });

  it("rejects a concurrent duplicate retry with 409 and audits the rejection", async () => {
    mockWebhookEvent.claimForManualRetry
      .mockResolvedValueOnce(1) // first request wins the race
      .mockResolvedValueOnce(0); // second request loses

    const res1 = makeRes();
    const res2 = makeRes();

    await Promise.all([
      retryDeadLetter(makeReq(), res1),
      retryDeadLetter(makeReq({ user: { id: 12 } }), res2),
    ]);

    const statuses = [res1.status.mock.calls[0][0], res2.status.mock.calls[0][0]].sort();
    expect(statuses).toEqual([200, 409]);

    expect(mockDelivery.executeDelivery).toHaveBeenCalledTimes(1);
    expect(mockAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ outcome: "rejected_duplicate_in_flight" }),
      }),
    );
  });

  it("does not attempt to claim an event that is not in the dead-letter queue", async () => {
    mockWebhookEvent.findById.mockResolvedValue({ ...deadLetterEvent, status: "success" });

    const res = makeRes();
    await retryDeadLetter(makeReq(), res);

    expect(mockWebhookEvent.claimForManualRetry).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns the event to the DLQ and audits an error when dispatch throws", async () => {
    mockDelivery.executeDelivery.mockRejectedValue(new Error("signature failure"));

    const res = makeRes();
    await retryDeadLetter(makeReq(), res);

    expect(mockWebhookEvent.releaseManualRetry).toHaveBeenCalledWith("77");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(mockAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ outcome: "error" }) }),
    );
  });

  it("audits a 202 re-queue when the immediate redelivery fails", async () => {
    mockDelivery.executeDelivery.mockResolvedValue(false);

    const res = makeRes();
    await retryDeadLetter(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(mockAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ outcome: "requeued" }) }),
    );
  });
});
