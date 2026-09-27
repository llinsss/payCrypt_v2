import axios from "axios";
import redis from "../config/redis.js";
import CircuitBreakerService from "./CircuitBreakerService.js";

const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY;
const CACHE_KEY = "exchange_rates:fiat";

/**
 * Freshness contract (issue #584)
 * ------------------------------------------------------------------
 * A cached rate set is "fresh" for STALE_AFTER_SECONDS after it was fetched
 * from the provider. Between STALE_AFTER_SECONDS and MAX_STALE_SECONDS the data
 * is still served but explicitly flagged as degraded/stale. Past
 * MAX_STALE_SECONDS the data is considered obsolete and MUST NOT back a
 * financial conversion — callers get a `StaleExchangeRateError` unless the
 * operator has opted into degraded mode.
 */
const STALE_AFTER_SECONDS =
  Number.parseInt(process.env.EXCHANGE_RATE_STALE_SECONDS ?? "", 10) || 3600; // 1h
const MAX_STALE_SECONDS =
  Number.parseInt(process.env.EXCHANGE_RATE_MAX_STALE_SECONDS ?? "", 10) || 21600; // 6h
// When true, a hard-stale (or missing) cache degrades to bundled fallback rates
// instead of throwing. Off by default so conversions fail loudly rather than
// silently transacting on obsolete data after a provider outage.
const ALLOW_DEGRADED = process.env.EXCHANGE_RATE_ALLOW_DEGRADED === "true";

// Keep the Redis entry available for the whole bounded-stale window so we can
// still serve (flagged) data during a prolonged provider outage.
const CACHE_TTL = MAX_STALE_SECONDS;

const FALLBACK_RATES = Object.freeze({ USD: 1, EUR: 0.93, GBP: 0.79, NGN: 1600 });

const api = axios.create({
  baseURL: `https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}`,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Thrown when the only rates available are older than MAX_STALE_SECONDS and
 * degraded mode is disabled.
 */
export class StaleExchangeRateError extends Error {
  constructor(ageSeconds, source) {
    const age = Number.isFinite(ageSeconds) ? `${Math.round(ageSeconds)}s` : "unknown";
    super(
      `Exchange rates are stale (age ${age}, source ${source}); refusing to serve obsolete conversion data`,
    );
    this.name = "StaleExchangeRateError";
    this.code = "EXCHANGE_RATE_STALE";
    this.ageSeconds = ageSeconds;
    this.source = source;
  }
}

function classifyFreshness(ageSeconds) {
  if (!Number.isFinite(ageSeconds)) return "expired";
  if (ageSeconds < STALE_AFTER_SECONDS) return "fresh";
  if (ageSeconds < MAX_STALE_SECONDS) return "stale";
  return "expired";
}

function ageSecondsOf(record) {
  if (!record || !record.fetched_at) return Number.POSITIVE_INFINITY;
  const fetchedMs = new Date(record.fetched_at).getTime();
  if (Number.isNaN(fetchedMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - fetchedMs) / 1000);
}

class ExchangeRateService {
  constructor() {
    this.supportedCurrencies = ["USD", "EUR", "GBP", "NGN"];
  }

  async _readCache() {
    const cached = await redis.get(CACHE_KEY);
    if (!cached) return null;

    try {
      const parsed = JSON.parse(cached);
      // Current format: { rates, fetched_at, source }
      if (parsed && parsed.rates && typeof parsed.rates === "object") {
        return {
          rates: parsed.rates,
          fetched_at: parsed.fetched_at ?? null,
          source: parsed.source ?? "cache",
        };
      }
      // Legacy format: a bare { USD: 1, ... } map with no freshness metadata.
      if (parsed && typeof parsed === "object") {
        return { rates: parsed, fetched_at: null, source: "cache" };
      }
      return null;
    } catch {
      return null;
    }
  }

  async _fetchFresh() {
    console.log("🔄 Fetching fresh exchange rates...");
    const { data } = await api.get("/latest/USD");

    if (data && data.result === "success" && data.conversion_rates) {
      const rates = {};
      this.supportedCurrencies.forEach((curr) => {
        if (data.conversion_rates[curr]) {
          rates[curr] = data.conversion_rates[curr];
        }
      });

      const record = {
        rates,
        fetched_at: new Date().toISOString(),
        source: "exchangerate-api",
      };

      await redis.set(CACHE_KEY, JSON.stringify(record), { EX: CACHE_TTL });
      return record;
    }

    throw new Error("API response unsuccessful");
  }

  /**
   * Resolve rates together with their freshness metadata.
   *
   * @param {{ allowStale?: boolean }} [options]
   *   allowStale (default true) — serve a bounded-stale cache when the provider
   *   is unreachable. Set false to require fresh data.
   * @returns {Promise<{ rates: Object, fetchedAt: string|null, source: string,
   *   ageSeconds: number, freshness: 'fresh'|'stale'|'expired', degraded: boolean }>}
   */
  async getRatesDetailed({ allowStale = true } = {}) {
    return CircuitBreakerService.fire("exchangeRate", async () => {
      const cached = await this._readCache();
      const cachedAge = ageSecondsOf(cached);

      // Fast path: a fresh cache needs no provider call.
      if (cached && cached.fetched_at && cachedAge < STALE_AFTER_SECONDS) {
        return {
          rates: cached.rates,
          fetchedAt: cached.fetched_at,
          source: cached.source,
          ageSeconds: cachedAge,
          freshness: "fresh",
          degraded: false,
        };
      }

      // Cache is stale, expired, missing, or lacks a timestamp — refresh it.
      try {
        const fresh = await this._fetchFresh();
        return {
          rates: fresh.rates,
          fetchedAt: fresh.fetched_at,
          source: fresh.source,
          ageSeconds: 0,
          freshness: "fresh",
          degraded: false,
        };
      } catch (error) {
        console.error("❌ Failed to fetch exchange rates:", error.message);

        // Serve a bounded-stale cache rather than failing outright.
        if (
          allowStale &&
          cached &&
          cached.fetched_at &&
          cachedAge < MAX_STALE_SECONDS
        ) {
          console.warn(
            `⚠️ Serving stale exchange rates (age ${Math.round(cachedAge)}s) after provider failure`,
          );
          return {
            rates: cached.rates,
            fetchedAt: cached.fetched_at,
            source: cached.source,
            ageSeconds: cachedAge,
            freshness: "stale",
            degraded: true,
          };
        }

        // Hard-stale or missing cache: degrade explicitly or fail loudly.
        if (ALLOW_DEGRADED) {
          console.warn("⚠️ Falling back to bundled exchange rates (degraded mode)");
          return {
            rates: { ...FALLBACK_RATES },
            fetchedAt: null,
            source: "fallback",
            ageSeconds: Number.POSITIVE_INFINITY,
            freshness: "expired",
            degraded: true,
          };
        }

        throw new StaleExchangeRateError(cachedAge, cached?.source ?? "none");
      }
    });
  }

  /**
   * Fetch latest exchange rates with caching.
   * @returns {Promise<Object>} Exchange rates relative to USD
   */
  async getRates(options) {
    const { rates } = await this.getRatesDetailed(options);
    return rates;
  }

  /**
   * Report how fresh the currently cached rates are without triggering a fetch.
   */
  async getFreshness() {
    const cached = await this._readCache();
    const ageSeconds = cached && cached.fetched_at ? ageSecondsOf(cached) : null;

    return {
      available: Boolean(cached && cached.fetched_at),
      fetchedAt: cached?.fetched_at ?? null,
      source: cached?.source ?? null,
      ageSeconds,
      freshness: ageSeconds === null ? "unknown" : classifyFreshness(ageSeconds),
      staleAfterSeconds: STALE_AFTER_SECONDS,
      maxStaleSeconds: MAX_STALE_SECONDS,
    };
  }

  /**
   * Convert amount between currencies
   * @param {number} amount Amount in USD
   * @param {string} to Target currency
   * @returns {Promise<number>} Converted amount
   */
  async convertFromUSD(amount, to) {
    if (to === "USD") return amount;

    const rates = await this.getRates();
    const rate = rates[to] || 1;

    return Number((amount * rate).toFixed(2));
  }

  /**
   * Convert amount from arbitrary currency to USD
   * @param {number} amount Amount in source currency
   * @param {string} from Source currency
   * @returns {Promise<number>} Converted amount in USD
   */
  async convertToUSD(amount, from) {
    if (from === "USD") return amount;

    const rates = await this.getRates();
    const rate = rates[from] || 1;

    return Number((amount / rate).toFixed(2));
  }

  /**
   * Legacy wrapper for backward compatibility
   */
  async rate(currency) {
    return this.getRates();
  }
}

export const instance = new ExchangeRateService();
export default instance;

// Named exports for compatibility
export const getRates = (options) => instance.getRates(options);
export const getRatesDetailed = (options) => instance.getRatesDetailed(options);
export const getFreshness = () => instance.getFreshness();
export const convertFromUSD = (amount, to) => instance.convertFromUSD(amount, to);
export const convertToUSD = (amount, from) => instance.convertToUSD(amount, from);
export async function rate(currency) {
  return instance.getRates();
}
