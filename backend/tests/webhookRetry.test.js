import { jest } from '@jest/globals';

// Mock dependencies
jest.unstable_mockModule("axios", () => ({
  default: { post: jest.fn() }
}));

jest.unstable_mockModule("../models/WebhookEvent.js", () => ({
  default: {
    markSuccess: jest.fn(),
    markFailed: jest.fn(),
    markDeadLetter: jest.fn(),
    scheduleRetry: jest.fn(),
  }
}));

jest.unstable_mockModule("../models/Webhook.js", () => ({
  default: {
    recordTrigger: jest.fn(),
    updateStatus: jest.fn()
  }
}));

jest.unstable_mockModule("../config/redis.js", () => ({
  redisConnection: null,
  publish: jest.fn(),
  default: { isOpen: true, connect: jest.fn(), on: jest.fn() },
  subClient: { isOpen: true, connect: jest.fn(), on: jest.fn() }
}));

jest.unstable_mockModule("../queues/webhookRetry.js", () => ({
  webhookRetryQueue: { add: jest.fn() }
}));

const { default: WebhookDeliveryService } = await import("../services/WebhookDeliveryService.js");
const { default: WebhookEvent } = await import("../models/WebhookEvent.js");
const { default: Webhook } = await import("../models/Webhook.js");
const { default: axios } = await import("axios");

describe("WebhookDeliveryService DLQ & Retry Logic", () => {
  const mockPayload = { event: "payment.completed", data: { id: 1 } };
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks as success on direct 200 OK delivery", async () => {
    axios.post.mockResolvedValueOnce({ status: 200, data: { received: true } });

    const result = await WebhookDeliveryService.executeDelivery({
      eventId: 101,
      webhookId: 10,
      payload: mockPayload,
      url: "https://example.com/webhook",
      secret: "secret123",
      currentAttempt: 0
    });

    expect(result).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(WebhookEvent.markSuccess).toHaveBeenCalledWith(101, 200, JSON.stringify({ received: true }));
  });

  it("handles failure and schedules next retry when attempt < 5", async () => {
    // Simulate a 500 Internal Server Error
    axios.post.mockRejectedValueOnce({
      response: { status: 500 },
      message: "Request failed with status code 500"
    });

    const result = await WebhookDeliveryService.executeDelivery({
      eventId: 102,
      webhookId: 10,
      payload: mockPayload,
      url: "https://example.com/webhook",
      secret: "secret123",
      currentAttempt: 0
    });

    expect(result).toBe(false);
    expect(WebhookEvent.markFailed).toHaveBeenCalledWith(102, "Request failed with status code 500", 500);
    // Because currentAttempt = 0, next attempting is 1 (delay 1m = 60000ms)
    expect(WebhookEvent.scheduleRetry).toHaveBeenCalledTimes(1);
  });

  it("transfers to Dead Letter Queue when max retries are exceeded", async () => {
    // Simulate a Network Timeout
    axios.post.mockRejectedValueOnce({
      message: "timeout of 10000ms exceeded"
    });

    const result = await WebhookDeliveryService.executeDelivery({
      eventId: 103,
      webhookId: 10,
      payload: mockPayload,
      url: "https://example.com/webhook",
      secret: "secret123",
      currentAttempt: 5 // Next attempt would be 6 (> MAX_RETRIES)
    });

    expect(result).toBe(false);
    expect(WebhookEvent.markDeadLetter).toHaveBeenCalledWith(103, "timeout of 10000ms exceeded");
    // Verify it disabled the Webhook locally
    expect(Webhook.updateStatus).toHaveBeenCalledWith(10, "failed", expect.stringContaining("Dead letter tracking active"));
    // Ensure schedule was NOT called
    expect(WebhookEvent.scheduleRetry).not.toHaveBeenCalled();
  });
});
