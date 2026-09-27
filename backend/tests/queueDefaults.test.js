import { describe, it, expect, jest } from "@jest/globals";
import {
  DEFAULT_JOB_OPTIONS,
  buildJobOptions,
  assertPayloadSize,
  attachQueueDepthAlert,
  DEFAULT_DEPTH_ALERT_THRESHOLD,
} from "../queues/queueDefaults.js";

describe("queueDefaults", () => {
  describe("buildJobOptions", () => {
    it("uses centralized retention defaults when no overrides are given", () => {
      const opts = buildJobOptions();
      expect(opts.removeOnComplete).toEqual(DEFAULT_JOB_OPTIONS.removeOnComplete);
      expect(opts.removeOnFail).toEqual(DEFAULT_JOB_OPTIONS.removeOnFail);
      expect(opts.attempts).toBe(3);
    });

    it("lets a queue override specific fields without losing the rest", () => {
      const opts = buildJobOptions({ attempts: 10, removeOnComplete: { count: 50 } });
      expect(opts.attempts).toBe(10);
      expect(opts.removeOnComplete).toEqual({ count: 50 });
      expect(opts.removeOnFail).toEqual(DEFAULT_JOB_OPTIONS.removeOnFail);
      expect(opts.backoff).toEqual(DEFAULT_JOB_OPTIONS.backoff);
    });

    it("merges partial backoff overrides onto the default backoff", () => {
      const opts = buildJobOptions({ backoff: { delay: 2000 } });
      expect(opts.backoff).toEqual({ type: "exponential", delay: 2000 });
    });
  });

  describe("assertPayloadSize", () => {
    it("allows payloads within the size cap", () => {
      expect(() => assertPayloadSize({ foo: "bar" })).not.toThrow();
    });

    it("rejects payloads exceeding the configured byte limit", () => {
      const bigPayload = { data: "x".repeat(1000) };
      expect(() => assertPayloadSize(bigPayload, 100)).toThrow(/exceeds the 100 byte limit/);
    });
  });

  describe("attachQueueDepthAlert", () => {
    it("returns null and does nothing for a null queue", () => {
      expect(attachQueueDepthAlert(null, "test-queue")).toBeNull();
    });

    it("logs a warning once queue depth crosses the threshold", async () => {
      jest.useFakeTimers();
      const fakeQueue = {
        getJobCounts: jest.fn().mockResolvedValue({ waiting: DEFAULT_DEPTH_ALERT_THRESHOLD + 1, active: 0, delayed: 0 }),
        getJobs: jest.fn().mockResolvedValue([]),
      };

      const interval = attachQueueDepthAlert(fakeQueue, "test-queue", { intervalMs: 1000 });
      await jest.advanceTimersByTimeAsync(1000);

      expect(fakeQueue.getJobCounts).toHaveBeenCalledWith("waiting", "active", "delayed");
      clearInterval(interval);
      jest.useRealTimers();
    });
  });
});
