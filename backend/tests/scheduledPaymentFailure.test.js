import { jest, describe, it, expect, afterEach } from "@jest/globals";

jest.unstable_mockModule("../config/database.js", () => ({
  default: Object.assign(jest.fn(), { fn: { now: jest.fn() } }),
}));

const { default: ScheduledPayment } = await import("../models/ScheduledPayment.js");

describe("ScheduledPayment.recordFailure", () => {
  afterEach(() => jest.restoreAllMocks());

  it("increments failure_count and keeps the payment pending under the threshold", async () => {
    jest.spyOn(ScheduledPayment, "findById").mockResolvedValue({
      id: 1,
      failure_count: 1,
      scheduled_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(ScheduledPayment, "update").mockImplementation(async (id, data) => ({ id, ...data }));

    const result = await ScheduledPayment.recordFailure(1, "insufficient balance");

    expect(ScheduledPayment.update).toHaveBeenCalledWith(1, expect.objectContaining({
      failure_count: 2,
      failure_reason: "insufficient balance",
      status: "pending",
    }));
    expect(result.status).toBe("pending");
    expect(result.failure_count).toBe(2);
  });

  it("pauses the payment once failure_count reaches the threshold", async () => {
    jest.spyOn(ScheduledPayment, "findById").mockResolvedValue({
      id: 1,
      failure_count: 2,
      scheduled_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(ScheduledPayment, "update").mockImplementation(async (id, data) => ({ id, ...data }));

    const result = await ScheduledPayment.recordFailure(1, "network timeout");

    expect(ScheduledPayment.update).toHaveBeenCalledWith(1, expect.objectContaining({
      failure_count: 3,
      failure_reason: "network timeout",
      status: "paused",
    }));
    expect(result.status).toBe("paused");
  });

  it("treats a missing failure_count as zero", async () => {
    jest.spyOn(ScheduledPayment, "findById").mockResolvedValue({
      id: 1,
      scheduled_at: new Date("2026-01-01T00:00:00Z"),
    });
    jest.spyOn(ScheduledPayment, "update").mockImplementation(async (id, data) => ({ id, ...data }));

    const result = await ScheduledPayment.recordFailure(1, "no signing keys");

    expect(result.failure_count).toBe(1);
    expect(result.status).toBe("pending");
  });
});

describe("ScheduledPayment.resume", () => {
  afterEach(() => jest.restoreAllMocks());

  it("resets failure tracking and reactivates the payment", async () => {
    jest.spyOn(ScheduledPayment, "update").mockImplementation(async (id, data) => ({ id, ...data }));

    const result = await ScheduledPayment.resume(9);

    expect(ScheduledPayment.update).toHaveBeenCalledWith(9, expect.objectContaining({
      status: "pending",
      failure_count: 0,
      failure_reason: null,
      last_failure_at: null,
    }));
    expect(result.status).toBe("pending");
    expect(result.failure_count).toBe(0);
  });
});
