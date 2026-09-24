import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import FeeEstimationSingleton, { FeeEstimationService } from "../services/FeeEstimationService.js";

const FEES = { slow: 10, normal: 12, fast: 15 };
const countTimeouts = () =>
  process.getActiveResourcesInfo().filter((type) => type === "Timeout").length;

describe("FeeEstimationService lifecycle", () => {
  let service;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    service = new FeeEstimationService({ updateInterval: 1000 });
    jest.spyOn(service, "queryNetworkFees").mockResolvedValue(FEES);
  });

  afterEach(() => {
    service.stop();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("does not start timers on construction or import", () => {
    expect(service.isRunning()).toBe(false);
    expect(FeeEstimationSingleton.isRunning()).toBe(false);
    expect(service.queryNetworkFees).not.toHaveBeenCalled();
  });

  it("fetches immediately on start and then on every interval", async () => {
    jest.useFakeTimers();

    expect(service.start()).toBe(true);
    await Promise.resolve();
    expect(service.queryNetworkFees).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(2000);
    expect(service.queryNetworkFees).toHaveBeenCalledTimes(3);
    expect(service.getEstimates().fees).toEqual(FEES);
  });

  it("ignores duplicate start() calls", async () => {
    jest.useFakeTimers();

    service.start();
    expect(service.start()).toBe(false);
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(service.queryNetworkFees).toHaveBeenCalledTimes(2);
  });

  it("stop() clears the interval and can be restarted", async () => {
    jest.useFakeTimers();

    service.start();
    service.stop();
    expect(service.isRunning()).toBe(false);
    expect(jest.getTimerCount()).toBe(0);

    await jest.advanceTimersByTimeAsync(5000);
    expect(service.queryNetworkFees).toHaveBeenCalledTimes(1);

    expect(service.start()).toBe(true);
    expect(service.isRunning()).toBe(true);
  });

  it("unrefs the interval so it cannot keep the process alive", () => {
    const before = countTimeouts();

    service.start();
    expect(service.timer.hasRef()).toBe(false);
    expect(countTimeouts()).toBe(before);
  });

  it("leaves no open timer handles after stop()", () => {
    const before = countTimeouts();

    service.start();
    const { timer } = service;
    service.stop();

    expect(timer.hasRef()).toBe(false);
    expect(countTimeouts()).toBe(before);
  });

  it("stop() is safe to call when not started", () => {
    expect(() => service.stop()).not.toThrow();
  });
});
