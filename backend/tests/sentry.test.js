import { EventEmitter } from "node:events";
import { describe, expect, it, jest } from "@jest/globals";
import { instrumentBullWorker, instrumentRedisClient, withSentrySpan } from "../observability/sentry.js";

describe("Sentry observability helpers", () => {
  it("preserves the result and errors from instrumented operations", async () => {
    await expect(withSentrySpan("test operation", "test", async () => "ok")).resolves.toBe("ok");
    await expect(withSentrySpan("failed operation", "test", async () => {
      throw new Error("expected failure");
    })).rejects.toThrow("expected failure");
  });

  it("wraps Redis commands without changing their arguments or result", async () => {
    const get = jest.fn().mockResolvedValue("value");
    const client = instrumentRedisClient({ get }, "test");

    await expect(client.get("cache-key")).resolves.toBe("value");
    expect(get).toHaveBeenCalledWith("cache-key");
  });

  it("creates and closes a span for BullMQ job lifecycle events", () => {
    const worker = new EventEmitter();
    instrumentBullWorker(worker, "test-queue");

    expect(() => {
      worker.emit("active", { id: "job-1" });
      worker.emit("completed", { id: "job-1" });
      worker.emit("active", { id: "job-2" });
      worker.emit("failed", { id: "job-2" }, new Error("job failed"));
    }).not.toThrow();
  });
});

