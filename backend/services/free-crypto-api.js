import axios from "axios";
import dotenv from "dotenv";
import { correctTokenKey } from "../utils/token.js";
import CircuitBreakerService from "./CircuitBreakerService.js";
dotenv.config();

const FREE_CRYPTO_API_KEY = process.env.FREE_CRYPTO_API_KEY;

const api = axios.create({
  baseURL: "https://api.freecryptoapi.com/v1",
  headers: {
    Authorization: `Bearer ${FREE_CRYPTO_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// ✅ Get price of crypto currency with fallbacks
export async function rate(token) {
  return CircuitBreakerService.fire('cryptoApi', async () => {
    const symbol = correctTokenKey(token);
    
    // Try Free Crypto API
    try {
      const { data } = await api.get(`/getData?symbol=${symbol}`);
      if (
        data &&
        data.status === "success" &&
        data.symbols &&
        data.symbols.length > 0
      ) {
        return data.symbols[0];
      }
    } catch (e) {
      console.error(`Free Crypto API failed for ${symbol}: ${e.message}`);
    }

    // Fallback 1: Binance API
    try {
      const binanceSymbol = symbol.toUpperCase() + 'USDT';
      const { data } = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`);
      if (data && data.price) {
        return {
          symbol: symbol,
          last: data.price
        };
      }
    } catch (e) {
      console.error(`Binance API failed for ${symbol}: ${e.message}`);
    }
    
    // Fallback 2: CoinGecko API
    try {
      // Very basic mapping for CoinGecko IDs, expand as necessary
      const coingeckoMap = { 'BTC': 'bitcoin', 'ETH': 'ethereum', 'XLM': 'stellar' };
      const cgId = coingeckoMap[symbol.toUpperCase()] || symbol.toLowerCase();
      const { data } = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${cgId}&vs_currencies=usd`);
      if (data && data[cgId] && data[cgId].usd) {
        return {
          symbol: symbol,
          last: data[cgId].usd.toString()
        };
      }
    } catch (e) {
      console.error(`CoinGecko API failed for ${symbol}: ${e.message}`);
    }

    return null;
  });
}
