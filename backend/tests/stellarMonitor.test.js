import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const root = jest.fn();
jest.unstable_mockModule("stellar-sdk", () => ({
  Horizon: { Server: jest.fn(() => ({ root })) },
}));
jest.unstable_mockModule("../utils/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { checkStellarHealth, monitorStellarNetwork } = await import("../services/stellarMonitor.js");

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const flush = () => new Promise((r) => jest.requireActual("timers").setImmediate(r));

describe("legacy Stellar monitor", () => {
  let stop;

  beforeEach(() => {
    jest.useFakeTimers();
    root.mockReset();
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    jest.useRealTimers();
  });

  it("does not start another poll while a slow Horizon call is pending", async () => {
    const slow = deferred();
    root.mockReturnValueOnce(slow.promise).mockResolvedValue({ horizon_version: "2" });

    stop = monitorStellarNetwork({ intervalMs: 1000 });
    await jest.advanceTimersByTimeAsync(10_000);
    expect(root).toHaveBeenCalledTimes(1);

    slow.resolve({ horizon_version: "1" });
    await flush();
    await jest.advanceTimersByTimeAsync(999);
    expect(root).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(root).toHaveBeenCalledTimes(2);
  });

  it("keeps polling after a failed check and stops when asked", async () => {
    root.mockRejectedValueOnce(new Error("timeout")).mockResolvedValue({});

    stop = monitorStellarNetwork({ intervalMs: 1000 });
    await flush();
    await jest.advanceTimersByTimeAsync(1000);
    expect(root).toHaveBeenCalledTimes(2);

    stop();
    await jest.advanceTimersByTimeAsync(5000);
    expect(root).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight Horizon request between concurrent callers", async () => {
    const slow = deferred();
    root.mockReturnValueOnce(slow.promise).mockResolvedValue({ horizon_version: "2" });

    const first = checkStellarHealth();
    const second = checkStellarHealth();
    expect(second).toBe(first);
    expect(root).toHaveBeenCalledTimes(1);

    slow.resolve({ horizon_version: "1" });
    await expect(first).resolves.toMatchObject({ status: "up", details: { horizon_version: "1" } });

    await expect(checkStellarHealth()).resolves.toMatchObject({ details: { horizon_version: "2" } });
    expect(root).toHaveBeenCalledTimes(2);
  });
});
