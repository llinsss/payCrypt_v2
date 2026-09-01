import axios from "axios";

class MultiChainTransactionService {
  constructor() {
    this.providers = {
      ethereum: process.env.ETH_RPC_URL || "https://eth-mainnet.g.alchemy.com/v2/demo",
      base: process.env.BASE_RPC_URL || "https://base-mainnet.g.alchemy.com/v2/demo",
      lisk: process.env.LISK_RPC_URL || "https://rpc.mainnet.lisk.com",
      u2u: process.env.U2U_RPC_URL || "https://mainnet-rpc.u2u.smartchain.asia",
    };
    this.gasBuffer = 1.2; // 20% buffer on top of estimate
    this.tokenPrices = new Map();
  }

  /**
   * Estimate gas for a transaction on a specific EVM chain
   */
  async estimateTransactionGas(txParams, chain) {
    if (!this.isEVMChain(chain)) {
      throw {
        code: "UNSUPPORTED_CHAIN",
        message: `Chain ${chain} is not supported for gas estimation`,
        statusCode: 400,
      };
    }

    try {
      const provider = this.providers[chain];
      if (!provider) {
        throw new Error(`No RPC provider configured for ${chain}`);
      }

      // Validate transaction parameters
      if (!txParams.from || !txParams.to) {
        throw {
          code: "INVALID_TX_PARAMS",
          message: "Transaction must have 'from' and 'to' addresses",
          statusCode: 400,
        };
      }

      // Call eth_estimateGas RPC method
      const response = await axios.post(provider, {
        jsonrpc: "2.0",
        method: "eth_estimateGas",
        params: [
          {
            from: txParams.from,
            to: txParams.to,
            value: txParams.value || "0x0",
            data: txParams.data || "0x",
            gas: txParams.gas,
          },
        ],
        id: 1,
      });

      if (response.data.error) {
        throw new Error(response.data.error.message);
      }

      const gasEstimate = BigInt(response.data.result);
      const gasWithBuffer = gasEstimate * BigInt(Math.floor(this.gasBuffer * 100)) / BigInt(100);

      // Get current gas price
      const gasPriceResponse = await axios.post(provider, {
        jsonrpc: "2.0",
        method: "eth_gasPrice",
        params: [],
        id: 1,
      });

      const gasPrice = BigInt(gasPriceResponse.data.result);
      const totalGasWei = gasWithBuffer * gasPrice;

      // Convert to USD/NGN based on chain
      const chainNativeToken = this.getNativeTokenSymbol(chain);
      const gasEstimateInUSD = await this.convertToUSD(totalGasWei, chainNativeToken);

      return {
        success: true,
        chain,
        gasEstimate: gasEstimate.toString(),
        gasWithBuffer: gasWithBuffer.toString(),
        gasPrice: gasPrice.toString(),
        totalGasWei: totalGasWei.toString(),
        estimateInUSD: gasEstimateInUSD,
        nativeToken: chainNativeToken,
      };
    } catch (error) {
      console.error(`Gas estimation error on ${chain}:`, error.message);

      // Handle RPC errors gracefully
      if (error.response?.data?.error) {
        throw {
          code: "RPC_ERROR",
          message: `Unable to estimate gas on ${chain}: ${error.response.data.error.message}`,
          statusCode: 502,
        };
      }

      throw {
        code: "GAS_ESTIMATION_FAILED",
        message: `Failed to estimate gas on ${chain}. Please try again later.`,
        statusCode: 503,
      };
    }
  }

  /**
   * Check if user has sufficient balance for transaction + gas
   */
  async validateSufficientGas(userBalance, chain, txParams) {
    try {
      const gasEstimate = await this.estimateTransactionGas(txParams, chain);

      const requiredBalance = BigInt(txParams.value || "0") + BigInt(gasEstimate.totalGasWei);
      const userBalanceBigInt = BigInt(userBalance);

      if (userBalanceBigInt < requiredBalance) {
        const shortfall = requiredBalance - userBalanceBigInt;
        return {
          sufficient: false,
          shortfall: shortfall.toString(),
          shortfallInUSD: await this.convertToUSD(shortfall, this.getNativeTokenSymbol(chain)),
          required: requiredBalance.toString(),
          userBalance: userBalance,
        };
      }

      return {
        sufficient: true,
        margin: (userBalanceBigInt - requiredBalance).toString(),
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get gas estimation preview for UI display
   */
  async getGasEstimationPreview(userBalance, chain, recipientTag, amount, token) {
    try {
      // Construct transaction parameters
      const txParams = {
        from: userBalance.address || "0x0000000000000000000000000000000000000000",
        to: recipientTag, // In real scenario, would resolve tag to address
        value: token === this.getNativeTokenSymbol(chain) ? amount : "0x0",
        data: "0x", // Would contain token transfer data if ERC20
      };

      const gasEstimate = await this.estimateTransactionGas(txParams, chain);
      const sufficiencyCheck = await this.validateSufficientGas(userBalance.balance, chain, txParams);

      return {
        success: true,
        preview: {
          chain,
          token,
          amount,
          gasFeeUSD: gasEstimate.estimateInUSD,
          gasFeeNative: this.formatGasPrice(gasEstimate.totalGasWei),
          hasInsufficientGas: !sufficiencyCheck.sufficient,
          shortfall: sufficiencyCheck.shortfall,
          shortfallInUSD: sufficiencyCheck.shortfallInUSD,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        code: error.code,
      };
    }
  }

  /**
   * Check if a chain is EVM-compatible
   */
  isEVMChain(chain) {
    return ["ethereum", "base", "lisk", "u2u"].includes(chain.toLowerCase());
  }

  /**
   * Get native token symbol for a chain
   */
  getNativeTokenSymbol(chain) {
    const symbolMap = {
      ethereum: "ETH",
      base: "ETH",
      lisk: "LSK",
      u2u: "U2U",
    };
    return symbolMap[chain.toLowerCase()] || "ETH";
  }

  /**
   * Convert gas amount to USD/NGN
   */
  async convertToUSD(amountWei, tokenSymbol) {
    try {
      // In production, use a price oracle or API
      // For now, return a mock value
      const prices = {
        ETH: 2500,
        LSK: 5,
        U2U: 0.5,
      };

      const tokenPrice = prices[tokenSymbol] || 1;
      const amountEther = parseFloat(amountWei.toString()) / 1e18;
      return (amountEther * tokenPrice).toFixed(2);
    } catch (error) {
      console.error("Price conversion error:", error);
      return "0.00";
    }
  }

  /**
   * Format gas price for display
   */
  formatGasPrice(gasWei) {
    const gasEther = parseFloat(gasWei.toString()) / 1e18;
    return gasEther.toFixed(6);
  }

  /**
   * Submit a transaction with pre-validated gas
   */
  async submitTransaction(txParams, chain, gasEstimate) {
    try {
      if (!gasEstimate) {
        // Re-estimate if not provided
        gasEstimate = await this.estimateTransactionGas(txParams, chain);
      }

      // In production, would sign and send transaction here
      return {
        success: true,
        transactionHash: "0x" + this.generateTxHash(),
        gasUsed: gasEstimate.gasWithBuffer,
        estimatedFee: gasEstimate.estimateInUSD,
      };
    } catch (error) {
      throw {
        code: "TX_SUBMISSION_FAILED",
        message: error.message,
        statusCode: 500,
      };
    }
  }

  generateTxHash() {
    return Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  }
}

export default new MultiChainTransactionService();
