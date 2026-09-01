import { describe, it, expect } from "@jest/globals";
import {
  runWithCorrelation,
  getCorrelationId,
  getRequestId,
} from "../utils/asyncContext.js";

describe("asyncContext", () => {
  it("returns null outside of a correlation context", () => {
    expect(getCorrelationId()).toBeNull();
    expect(getRequestId()).toBeNull();
  });

  it("exposes correlationId/requestId to synchronous code inside the context", () => {
    runWithCorrelation("corr-1", "req-1", () => {
      expect(getCorrelationId()).toBe("corr-1");
      expect(getRequestId()).toBe("req-1");
    });
  });

  it("propagates through async/await chains", async () => {
    const seen = await runWithCorrelation("corr-2", "req-2", async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { correlationId: getCorrelationId(), requestId: getRequestId() };
    });

    expect(seen).toEqual({ correlationId: "corr-2", requestId: "req-2" });
  });

  it("keeps concurrent contexts isolated from one another", async () => {
    const [a, b] = await Promise.all([
      runWithCorrelation("corr-a", "req-a", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return getCorrelationId();
      }),
      runWithCorrelation("corr-b", "req-b", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getCorrelationId();
      }),
    ]);

    expect(a).toBe("corr-a");
    expect(b).toBe("corr-b");
  });

  it("does not leak the context after the callback returns", () => {
    runWithCorrelation("corr-3", "req-3", () => {});
    expect(getCorrelationId()).toBeNull();
  });
});
