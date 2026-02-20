import axios from "axios";
import redis from "../config/redis.js";

const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY;
const CACHE_KEY = "exchange_rates:fiat";
const CACHE_TTL = 3600; // 1 hour

const api = axios.create({
  baseURL: `https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}`,
  headers: {
    "Content-Type": "application/json",
  },
});

class ExchangeRateService {
  constructor() {
    this.supportedCurrencies = ["USD", "EUR", "GBP", "NGN"];
  }

  /**
   * Fetch latest exchange rates with caching
   * @returns {Promise<Object>} Exchange rates relative to USD
   */
  async getRates() {
    try {
      // Try cache first
      const cached = await redis.get(CACHE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }

      // Fetch from API
      console.log("🔄 Fetching fresh exchange rates...");
      // Using USD as base for simplicity in internal calculations
      const { data } = await api.get("/latest/USD");

      if (data && data.result === "success" && data.conversion_rates) {
        const rates = data.conversion_rates;

        // Filter for supported currencies
        const filteredRates = {};
        this.supportedCurrencies.forEach((curr) => {
          if (rates[curr]) {
            filteredRates[curr] = rates[curr];
          }
        });

        // Cache the result
        await redis.set(CACHE_KEY, JSON.stringify(filteredRates), "EX", CACHE_TTL);

        return filteredRates;
      }

      throw new Error("API response unsuccessful");
    } catch (error) {
      console.error("❌ Failed to fetch exchange rates:", error.message);
      // Fallback rates if API/Cache fails
      return {
        USD: 1,
        EUR: 0.93,
        GBP: 0.79,
        NGN: 1600,
      };
    }
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
export const getRates = () => instance.getRates();
export const convertFromUSD = (amount, to) => instance.convertFromUSD(amount, to);
export const convertToUSD = (amount, from) => instance.convertToUSD(amount, from);
export async function rate(currency) {
  return instance.getRates();
}
