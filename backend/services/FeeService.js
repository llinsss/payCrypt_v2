import redis from "../config/redis.js";
import logger from "../utils/logger.js";

const FEE_CACHE_TTL = 5 * 60; // 5 minutes in seconds

const FEE_STRUCTURES = {
  tag: {
    // Withdraw to @tag (internal transfer)
    bank: { networkFee: 0, platformFee: 0.001 }, // 0.1%
    crypto: { networkFee: 0, platformFee: 0.001 },
    tag: { networkFee: 0, platformFee: 0.001 },
  },
  crypto: {
    // Withdraw to crypto wallet (external)
    bank: { networkFee: 0.01, platformFee: 0.005 }, // 1% + 0.5%
    crypto: { networkFee: 0.01, platformFee: 0.005 },
    tag: { networkFee: 0, platformFee: 0.001 }, // Cheaper to send to tag
  },
  bank: {
    // Withdraw to bank account (fiat conversion)
    bank: { networkFee: 0.015, platformFee: 0.01 }, // 1.5% + 1%
    crypto: { networkFee: 0.015, platformFee: 0.01 },
    tag: { networkFee: 0, platformFee: 0.001 }, // Cheaper to send to tag
  },
};

class FeeService {
  /**
   * Get fee breakdown for a withdrawal
   * @param {string} type - Withdrawal type: 'bank', 'crypto', 'tag'
   * @param {string} chain - Blockchain chain (e.g., 'base', 'xlm')
   * @param {string} token - Token symbol (e.g., 'USDC', 'USDT')
   * @param {number} amount - Withdrawal amount
   * @returns {Promise<Object>}
   */
  async getFeesAsync(type, chain, token, amount) {
    try {
      // Validate inputs
      if (!type || !["bank", "crypto", "tag"].includes(type)) {
        throw new Error("Invalid type. Must be 'bank', 'crypto', or 'tag'");
      }

      if (!chain || !token || amount <= 0) {
        throw new Error("Invalid chain, token, or amount");
      }

      // Try to get from cache
      const cacheKey = `fees:${type}:${chain}:${token}`;
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        return this.calculateFeeBreakdown(cached, amount);
      }

      // Get fee structure
      const feeRates = FEE_STRUCTURES[type] || FEE_STRUCTURES.crypto;
      const chainFees = feeRates[type] || feeRates.crypto;

      // Cache the fee structure
      await this.setCache(cacheKey, chainFees);

      return this.calculateFeeBreakdown(chainFees, amount);
    } catch (error) {
      logger.error({
        msg: "Error calculating fees",
        type,
        chain,
        token,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate fee breakdown for an amount
   * @private
   */
  calculateFeeBreakdown(feeRates, amount) {
    const networkFeeAmount = amount * feeRates.networkFee;
    const platformFeeAmount = amount * feeRates.platformFee;
    const totalFeeAmount = networkFeeAmount + platformFeeAmount;

    return {
      type: "breakdown",
      amount,
      networkFee: {
        rate: (feeRates.networkFee * 100).toFixed(2) + "%",
        amount: networkFeeAmount.toFixed(2),
      },
      platformFee: {
        rate: (feeRates.platformFee * 100).toFixed(2) + "%",
        amount: platformFeeAmount.toFixed(2),
      },
      totalFee: {
        rate: ((feeRates.networkFee + feeRates.platformFee) * 100).toFixed(2) + "%",
        amount: totalFeeAmount.toFixed(2),
      },
      amountAfterFees: (amount - totalFeeAmount).toFixed(2),
    };
  }

  /**
   * Get all available fee structures
   */
  async listFeeStructures() {
    return {
      tag: {
        description: "Withdraw to @tag (internal transfer)",
        fees: FEE_STRUCTURES.tag,
      },
      crypto: {
        description: "Withdraw to crypto wallet (external)",
        fees: FEE_STRUCTURES.crypto,
      },
      bank: {
        description: "Withdraw to bank account (fiat conversion)",
        fees: FEE_STRUCTURES.bank,
      },
    };
  }

  /**
   * Get from cache
   * @private
   */
  async getFromCache(key) {
    try {
      if (!redis) return null;
      const cached = await redis.get(key);
      if (cached) {
        logger.debug({ msg: "Cache hit", key });
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      logger.warn({ msg: "Cache read error", key, error: error.message });
      return null;
    }
  }

  /**
   * Set in cache
   * @private
   */
  async setCache(key, value) {
    try {
      if (!redis) return;
      await redis.setex(key, FEE_CACHE_TTL, JSON.stringify(value));
      logger.debug({ msg: "Cache set", key, ttl: FEE_CACHE_TTL });
    } catch (error) {
      logger.warn({ msg: "Cache write error", key, error: error.message });
    }
  }
}

export default new FeeService();
