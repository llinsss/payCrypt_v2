import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";

const mockUpdate = jest.fn().mockResolvedValue(1);
const mockDb = jest.fn((table) => ({
  select: jest.fn().mockResolvedValue([{ id: 1, token: "XLM" }]),
  where: jest.fn(() => ({ update: mockUpdate })),
  table,
}));
const mockRedis = { setEx: jest.fn().mockResolvedValue("OK") };
const mockCryptoRate = jest.fn();
const mockFxRate = jest.fn();

jest.unstable_mockModule("../config/database.js", () => ({ default: mockDb }));
jest.unstable_mockModule("../config/redis.js", () => ({ default: mockRedis }));
jest.unstable_mockModule("../services/free-crypto-api.js", () => ({ rate: mockCryptoRate }));
jest.unstable_mockModule("../services/exchange-rate-api.js", () => ({ rate: mockFxRate }));

const { createRefreshJob, updateTokenPrices, updateNgnRate } = await import(
  "../config/initials.js"
);

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("createRefreshJob", () => {
  let job;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    job?.stop();
    jest.restoreAllMocks();
  });

  it("never overlaps runs when a refresh takes longer than the interval", async () => {
    let active = 0;
    let maxActive = 0;
    const task = jest.fn(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(30);
      active--;
    });
    job = createRefreshJob({ name: "test", task, intervalMs: 5, leaseMs: 1000 });

    job.start();
    await sleep(120);
    job.stop();

    expect(task.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(maxActive).toBe(1);
    expect(job.stats().timedOut).toBe(0);
  });

  it("skips and counts a run requested while one is in flight", async () => {
    const gate = deferred();
    const task = jest.fn(() => gate.promise);
    job = createRefreshJob({ name: "test", task, intervalMs: 1000 });

    const first = job.run();
    const second = job.run();

    expect(second).toBe(first);
    await sleep(0);
    expect(task).toHaveBeenCalledTimes(1);
    expect(job.stats()).toMatchObject({ skipped: 1, running: true });

    gate.resolve();
    await first;
    expect(job.stats()).toMatchObject({ runs: 1, running: false });
    expect(job.stats().lastDurationMs).toEqual(expect.any(Number));
  });

  it("rejects writes from a run that outlived its lease", async () => {
    const gate = deferred();
    let wrote = null;
    const task = jest.fn(async ({ isCurrent }) => {
      await gate.promise;
      wrote = isCurrent();
    });
    job = createRefreshJob({ name: "test", task, intervalMs: 1000, leaseMs: 10 });

    await job.run();
    expect(job.stats()).toMatchObject({ timedOut: 1, running: false });

    gate.resolve();
    await sleep(0);
    expect(wrote).toBe(false);
    expect(job.stats().staleRejected).toBe(1);
  });

  it("ignores duplicate start() calls and leaves no pending timer after stop()", async () => {
    const task = jest.fn().mockResolvedValue();
    job = createRefreshJob({ name: "test", task, intervalMs: 50 });

    job.start();
    job.start();
    await sleep(0);
    job.stop();
    await sleep(80);

    expect(task).toHaveBeenCalledTimes(1);
  });

  it("keeps scheduling after a failed run", async () => {
    const task = jest.fn().mockRejectedValueOnce(new Error("upstream down")).mockResolvedValue();
    job = createRefreshJob({ name: "test", task, intervalMs: 5 });

    job.start();
    await sleep(40);
    job.stop();

    expect(task.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("refresh tasks honour the lease", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it("updateTokenPrices writes only while the lease is current", async () => {
    mockCryptoRate.mockResolvedValue({ last: "0.12" });

    await updateTokenPrices({ isCurrent: () => false });
    expect(mockUpdate).not.toHaveBeenCalled();

    await updateTokenPrices({ isCurrent: () => true });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ price: 0.12 }));
  });

  it("updateNgnRate writes only while the lease is current", async () => {
    mockFxRate.mockResolvedValue({ NGN: 1600 });

    await updateNgnRate({ isCurrent: () => false });
    expect(mockRedis.setEx).not.toHaveBeenCalled();

    await updateNgnRate();
    expect(mockRedis.setEx).toHaveBeenCalledWith("USD_NGN", expect.any(Number), "1600");
  });
});
