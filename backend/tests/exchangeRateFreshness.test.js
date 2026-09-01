import { jest } from "@jest/globals";

const mockApi = { get: jest.fn() };
const mockRedis = { get: jest.fn(), set: jest.fn() };

jest.unstable_mockModule("axios", () => ({
  default: { create: jest.fn(() => mockApi) },
}));

jest.unstable_mockModule("../config/redis.js", () => ({
  default: mockRedis,
}));

jest.unstable_mockModule("../services/CircuitBreakerService.js", () => ({
  default: { fire: (_key, fn, ...args) => fn(...args) },
}));

const { instance: ExchangeRateService, StaleExchangeRateError } = await import(
  "../services/exchange-rate-api.js"
);

const RATES = { USD: 1, EUR: 0.9, GBP: 0.8, NGN: 1600 };

function cacheEntry(ageSeconds, rates = RATES, source = "exchangerate-api") {
  return JSON.stringify({
    rates,
    fetched_at: new Date(Date.now() - ageSeconds * 1000).toISOString(),
    source,
  });
}

function providerSuccess(rates = RATES) {
  return { data: { result: "success", conversion_rates: rates } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRedis.set.mockResolvedValue("OK");
});

describe("ExchangeRateService freshness contract (issue #584)", () => {
  it("serves a fresh cache without calling the provider", async () => {
    mockRedis.get.mockResolvedValue(cacheEntry(60));

    const detailed = await ExchangeRateService.getRatesDetailed();

    expect(mockApi.get).not.toHaveBeenCalled();
    expect(detailed.freshness).toBe("fresh");
    expect(detailed.degraded).toBe(false);
    expect(detailed.rates).toEqual(RATES);
  });

  it("stores fetched_at and source when fetching from the provider", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockApi.get.mockResolvedValue(providerSuccess());

    const detailed = await ExchangeRateService.getRatesDetailed();

    expect(detailed.source).toBe("exchangerate-api");
    expect(detailed.freshness).toBe("fresh");
    const [, serialized] = mockRedis.set.mock.calls[0];
    const persisted = JSON.parse(serialized);
    expect(persisted.fetched_at).toBeDefined();
    expect(persisted.source).toBe("exchangerate-api");
  });

  it("serves a bounded-stale cache (degraded) when the provider fails", async () => {
    mockRedis.get.mockResolvedValue(cacheEntry(2 * 3600)); // 2h old — past soft, within hard
    mockApi.get.mockRejectedValue(new Error("provider 503"));

    const detailed = await ExchangeRateService.getRatesDetailed();

    expect(detailed.freshness).toBe("stale");
    expect(detailed.degraded).toBe(true);
    expect(detailed.rates).toEqual(RATES);
  });

  it("rejects conversions when the only data is hard-stale and degraded mode is off", async () => {
    mockRedis.get.mockResolvedValue(cacheEntry(10 * 3600)); // 10h old — past MAX_STALE
    mockApi.get.mockRejectedValue(new Error("provider down"));

    await expect(ExchangeRateService.getRatesDetailed()).rejects.toBeInstanceOf(
      StaleExchangeRateError,
    );
  });

  it("throws during a prolonged outage with no cache at all", async () => {
    mockRedis.get.mockResolvedValue(null);
    mockApi.get.mockRejectedValue(new Error("ENOTFOUND"));

    await expect(ExchangeRateService.getRates()).rejects.toBeInstanceOf(StaleExchangeRateError);
    await expect(ExchangeRateService.convertFromUSD(100, "NGN")).rejects.toBeInstanceOf(
      StaleExchangeRateError,
    );
  });

  it("reports freshness classification without triggering a fetch", async () => {
    mockRedis.get.mockResolvedValue(cacheEntry(2 * 3600));

    const freshness = await ExchangeRateService.getFreshness();

    expect(mockApi.get).not.toHaveBeenCalled();
    expect(freshness).toMatchObject({
      available: true,
      freshness: "stale",
      staleAfterSeconds: 3600,
      maxStaleSeconds: 21600,
    });
    expect(freshness.ageSeconds).toBeGreaterThan(3600);
  });

  it("reports 'unknown' freshness when nothing is cached", async () => {
    mockRedis.get.mockResolvedValue(null);

    const freshness = await ExchangeRateService.getFreshness();

    expect(freshness.available).toBe(false);
    expect(freshness.freshness).toBe("unknown");
  });
});
