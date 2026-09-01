import { jest } from "@jest/globals";

jest.unstable_mockModule("../models/Webhook.js", () => ({
  default: {
    findActive: jest.fn(),
  },
}));

jest.unstable_mockModule("../models/WebhookEvent.js", () => ({
  default: {
    createIdempotent: jest.fn(),
  },
}));

jest.unstable_mockModule("../models/AuditLog.js", () => ({
  default: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.unstable_mockModule("../queues/webhook.js", () => ({
  webhookQueue: { add: jest.fn() },
}));

jest.unstable_mockModule("../utils/validateWebhookUrl.js", () => ({
  validateWebhookUrl: jest.fn().mockResolvedValue(true),
}));

const { default: WebhookService } = await import("../services/WebhookService.js");
const { default: Webhook } = await import("../models/Webhook.js");
const { default: WebhookEvent } = await import("../models/WebhookEvent.js");
const { default: AuditLog } = await import("../models/AuditLog.js");
const { webhookQueue } = await import("../queues/webhook.js");

describe("WebhookService.dispatch idempotency", () => {
  const webhook = {
    id: 10,
    user_id: 5,
    url: "https://example.com/webhook",
    secret: "secret123",
    events: JSON.stringify(["payment.completed"]),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Webhook.findActive.mockResolvedValue([webhook]);
  });

  it("enqueues delivery for a newly created event", async () => {
    WebhookEvent.createIdempotent.mockResolvedValue({
      id: 1,
      status: "pending",
      attempt_count: 0,
    });

    await WebhookService.dispatch("payment.completed", { transaction_id: 1 }, 5);

    expect(webhookQueue.add).toHaveBeenCalledTimes(1);
    const [, jobData] = webhookQueue.add.mock.calls[0];
    expect(jobData.eventId).toBe(1);
    expect(jobData.eventKey).toEqual(expect.any(String));
    expect(AuditLog.create).not.toHaveBeenCalled();
  });

  it("skips re-enqueueing and logs a skip when the event already exists", async () => {
    WebhookEvent.createIdempotent.mockResolvedValue({
      id: 1,
      status: "success",
      attempt_count: 1,
    });

    await WebhookService.dispatch("payment.completed", { transaction_id: 1 }, 5);

    expect(webhookQueue.add).not.toHaveBeenCalled();
    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: "webhook_delivery_skipped" })
    );
  });
});
