import { jest } from "@jest/globals";

jest.unstable_mockModule("axios", () => ({
  default: { post: jest.fn() },
}));

jest.unstable_mockModule("../models/WebhookEvent.js", () => ({
  default: {
    markSuccess: jest.fn(),
    markFailed: jest.fn(),
    markDeadLetter: jest.fn(),
    scheduleRetry: jest.fn(),
  },
}));

jest.unstable_mockModule("../models/Webhook.js", () => ({
  default: {
    recordTrigger: jest.fn(),
    updateStatus: jest.fn(),
  },
}));

jest.unstable_mockModule("../config/redis.js", () => ({
  redisConnection: null,
  publish: jest.fn(),
  default: { isOpen: true, connect: jest.fn(), on: jest.fn() },
  subClient: { isOpen: true, connect: jest.fn(), on: jest.fn() },
}));

jest.unstable_mockModule("../queues/webhookRetry.js", () => ({
  webhookRetryQueue: { add: jest.fn() },
}));

const { default: WebhookDeliveryService, classifyDeliveryFailure } = await import(
  "../services/WebhookDeliveryService.js"
);
const { default: WebhookEvent } = await import("../models/WebhookEvent.js");
const { default: Webhook } = await import("../models/Webhook.js");
const { default: axios } = await import("axios");

const baseArgs = {
  eventId: 500,
  webhookId: 42,
  payload: { event: "payment.completed", data: { id: 1 } },
  url: "https://example.com/webhook",
  secret: "secret123",
  currentAttempt: 0,
};

describe("WebhookDeliveryService — response size & streaming bounds (issue #580)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends strict body/stream bounds on every delivery attempt", async () => {
    axios.post.mockResolvedValueOnce({ status: 200, data: { ok: true } });

    await WebhookDeliveryService.executeDelivery(baseArgs);

    const [, , config] = axios.post.mock.calls[0];
    expect(config.timeout).toBeGreaterThan(0);
    expect(config.maxContentLength).toBe(1_048_576);
    expect(config.maxBodyLength).toBe(1_048_576);
    expect(config.signal).toBeInstanceOf(AbortSignal);
  });

  it("treats an oversized response as a non-retryable failure and dead-letters immediately", async () => {
    axios.post.mockRejectedValueOnce({
      code: "ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED",
      message: "maxContentLength size of 1048576 exceeded",
    });

    const result = await WebhookDeliveryService.executeDelivery({ ...baseArgs, currentAttempt: 0 });

    expect(result).toBe(false);
    expect(WebhookEvent.markDeadLetter).toHaveBeenCalledTimes(1);
    expect(WebhookEvent.scheduleRetry).not.toHaveBeenCalled();
    expect(Webhook.updateStatus).toHaveBeenCalledWith(
      42,
      "failed",
      expect.stringContaining("Dead letter tracking active"),
    );
  });

  it("classifies a slow/aborted stream as retryable and schedules the next attempt", async () => {
    axios.post.mockRejectedValueOnce({
      code: "ERR_CANCELED",
      message: "canceled",
    });

    const result = await WebhookDeliveryService.executeDelivery({ ...baseArgs, currentAttempt: 1 });

    expect(result).toBe(false);
    expect(WebhookEvent.scheduleRetry).toHaveBeenCalledTimes(1);
    expect(WebhookEvent.markDeadLetter).not.toHaveBeenCalled();
  });

  it("classifyDeliveryFailure maps error shapes to retryability", () => {
    expect(classifyDeliveryFailure({ code: "ERR_FR_MAX_CONTENT_LENGTH_EXCEEDED" })).toEqual({
      retryable: false,
      reason: "oversized_response",
    });
    expect(classifyDeliveryFailure({ code: "ECONNABORTED", message: "timeout of 10000ms exceeded" })).toEqual({
      retryable: true,
      reason: "timeout",
    });
    expect(classifyDeliveryFailure({}, 404)).toEqual({ retryable: false, reason: "http_404" });
    expect(classifyDeliveryFailure({}, 429)).toEqual({ retryable: true, reason: "http_429" });
    expect(classifyDeliveryFailure({}, 503)).toEqual({ retryable: true, reason: "http_503" });
    expect(classifyDeliveryFailure({ message: "socket hang up" }, null)).toEqual({
      retryable: true,
      reason: "network_error",
    });
  });

  it("clears the overall deadline timer after a successful delivery", async () => {
    const clearSpy = jest.spyOn(global, "clearTimeout");
    axios.post.mockResolvedValueOnce({ status: 200, data: {} });

    await WebhookDeliveryService.executeDelivery(baseArgs);

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
