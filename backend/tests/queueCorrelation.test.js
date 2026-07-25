import { jest, describe, it, expect, beforeAll } from "@jest/globals";

// Fake BullMQ Queue whose prototype our module patches, so we can assert on
// the merged job data without needing a real Redis connection.
class FakeQueue {
  constructor(name) {
    this.name = name;
  }

  add(name, data, opts) {
    return Promise.resolve({ name, data, opts });
  }
}

jest.unstable_mockModule("bullmq", () => ({
  Queue: FakeQueue,
}));

let runWithCorrelation;
let Queue;

beforeAll(async () => {
  ({ runWithCorrelation } = await import("../utils/asyncContext.js"));
  ({ default: Queue } = await import("../utils/queueCorrelation.js"));
});

describe("queueCorrelation", () => {
  it("injects the active correlationId/requestId into job data", async () => {
    const queue = new Queue("test-queue");

    const job = await runWithCorrelation("corr-123", "req-456", () =>
      queue.add("do-thing", { foo: "bar" }),
    );

    expect(job.data).toEqual({
      foo: "bar",
      correlationId: "corr-123",
      originRequestId: "req-456",
    });
  });

  it("leaves job data untouched outside of a correlation context", async () => {
    const queue = new Queue("test-queue");

    const job = await queue.add("do-thing", { foo: "bar" });

    expect(job.data).toEqual({ foo: "bar" });
  });

  it("does not overwrite a correlationId explicitly set by the caller", async () => {
    const queue = new Queue("test-queue");

    const job = await runWithCorrelation("corr-outer", "req-outer", () =>
      queue.add("do-thing", { correlationId: "corr-explicit" }),
    );

    expect(job.data.correlationId).toBe("corr-explicit");
  });
});
