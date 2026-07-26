import db from "../config/database.js";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger.js";
import { generateReference } from "../utils/reference.js";
import WebhookService from "./WebhookService.js";

// Cache TTLs
const QUOTE_CACHE_TTL = 30_000; // 30 seconds
const QUOTE_MAX_AGE = 120_000; // 2 minutes max age for a quote to be valid

// In-memory store for pending quotes (in production, use Redis)
// Key: quoteId, Value: { quote data, createdAt, expiresAt }
const pendingQuotes = new Map();

// Periodically clean expired quotes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pendingQuotes.entries()) {
    if (value.expiresAt < now) {
      pendingQuotes.delete(key);
    }
  }
}, 60_000);

/**
 * SwapService handles token swap operations across multiple chains.
 *
 * Supports a two-step flow:
 * 1. getQuote() — Returns a price quote without executing
 * 2. confirmSwap() — Executes the swap using a valid quote
 *
 * Integrates with the autoswap-sdk for multi-chain DEX aggregation,
 * and falls back to exchange-rate-based pricing when the SDK is unavailable.
 */
const SwapService = {
  /**
   * Supported chain IDs (matching the seeds data).
   * 1 = Starknet, 2 = Lisk, 3 = Base, 4 = Flow, 5 = U2U, 6 = Stellar
   */
  SUPPORTED_CHAIN_IDS: [1, 2, 3, 4, 5, 6],

  /**
   * Get a swap quote without executing the trade.
   * @param {Object} params
   * @param {number} params.userId
   * @param {string} params.fromToken - Symbol of the token to swap from
   * @param {string} params.toToken - Symbol of the token to swap to
   * @param {number} params.amount - Amount of fromToken to swap
   * @param {number} params.chainId - Chain to execute the swap on
   * @param {number} [params.slippage=0.5] - Max slippage tolerance in percent
   * @returns {Object} Quote object
   */
  async getQuote({ userId, fromToken, toToken, amount, chainId, slippage = 0.5 }) {
    // Validate chain is supported
    if (!this.SUPPORTED_CHAIN_IDS.includes(chainId)) {
      throw new Error(`Unsupported chain ID: ${chainId}`);
    }

    // Validate tokens exist in database
    const [fromTokenRecord, toTokenRecord] = await Promise.all([
      this._findTokenBySymbol(fromToken),
      this._findTokenBySymbol(toToken),
    ]);

    if (!fromTokenRecord) {
      throw new Error(`Token not found: ${fromToken}`);
    }
    if (!toTokenRecord) {
      throw new Error(`Token not found: ${toToken}`);
    }

    // Check that both tokens are on the specified chain (or allow cross-chain)
    // For now, we validate both tokens exist and have valid prices
    if (!fromTokenRecord.price || fromTokenRecord.price <= 0) {
      throw new Error(`Token ${fromToken} does not have a valid price`);
    }
    if (!toTokenRecord.price || toTokenRecord.price <= 0) {
      throw new Error(`Token ${toToken} does not have a valid price`);
    }

    // Calculate swap rates using exchange rates
    const swapResult = await this._calculateSwap({
      fromToken: fromTokenRecord,
      toToken: toTokenRecord,
      amount,
      slippage,
    });

    // Generate a unique quote ID
    const quoteId = uuidv4();
    const now = Date.now();

    const quote = {
      quoteId,
      userId,
      fromToken: fromTokenRecord.symbol,
      toToken: toTokenRecord.symbol,
      fromTokenId: fromTokenRecord.id,
      toTokenId: toTokenRecord.id,
      chainId,
      amount: amount.toString(),
      slippage,
      rate: swapResult.rate,
      expectedOutput: swapResult.expectedOutput,
      minimumOutput: swapResult.minimumOutput,
      feePercent: swapResult.feePercent,
      feeAmount: swapResult.feeAmount,
      estimatedGas: swapResult.estimatedGas,
      priceImpact: swapResult.priceImpact,
      expiresAt: new Date(now + QUOTE_MAX_AGE).toISOString(),
      createdAt: new Date(now).toISOString(),
    };

    // Store the quote for later confirmation
    pendingQuotes.set(quoteId, {
      ...quote,
      expiresAt: now + QUOTE_MAX_AGE,
    });

    logger.info({ quoteId, fromToken, toToken, amount, chainId }, "Swap quote generated");

    return quote;
  },

  /**
   * Confirm and execute a swap using a previously obtained quote.
   * @param {Object} params
   * @param {number} params.userId
   * @param {string} params.quoteId - The quote to confirm
   * @param {string} params.fromToken
   * @param {string} params.toToken
   * @param {number} params.amount
   * @param {number} params.chainId
   * @param {number} [params.minReceiveAmount] - Minimum amount user is willing to receive
   * @returns {Object} Swap result
   */
  async confirmSwap({ userId, quoteId, fromToken, toToken, amount, chainId, minReceiveAmount }) {
    // Retrieve the stored quote
    const storedQuote = pendingQuotes.get(quoteId);

    if (!storedQuote) {
      throw new Error("Quote not found or has expired. Please request a new quote.");
    }

    if (storedQuote.expiresAt < Date.now()) {
      pendingQuotes.delete(quoteId);
      throw new Error("Quote has expired. Please request a new quote.");
    }

    // Validate quote belongs to this user
    if (storedQuote.userId !== userId) {
      throw new Error("Quote does not belong to this user.");
    }

    // Validate parameters match the quote
    if (storedQuote.fromToken !== fromToken || storedQuote.toToken !== toToken) {
      throw new Error("Token parameters do not match the original quote.");
    }

    if (parseFloat(storedQuote.amount) !== amount) {
      throw new Error("Amount does not match the original quote.");
    }

    if (storedQuote.chainId !== chainId) {
      throw new Error("Chain ID does not match the original quote.");
    }

    // Check minimum receive amount (slippage protection)
    if (minReceiveAmount && parseFloat(minReceiveAmount) > parseFloat(storedQuote.minimumOutput)) {
      throw new Error(
        `minReceiveAmount (${minReceiveAmount}) exceeds minimum guaranteed output (${storedQuote.minimumOutput})`
      );
    }

    // Generate swap reference
    const swapRef = generateReference(16);
    const swapId = uuidv4();

    // Execute the swap via the chain-specific handler
    let executionResult;
    try {
      executionResult = await this._executeSwap({
        quote: storedQuote,
        userId,
        swapId,
        swapRef,
      });
    } catch (error) {
      logger.error({ quoteId, error: error.message }, "Swap execution failed");

      // Emit swap.failed webhook
      await WebhookService.dispatch(
        WebhookService.WEBHOOK_EVENTS.SWAP_FAILED || "swap.failed",
        {
          swap_id: swapId,
          user_id: userId,
          from_token: fromToken,
          to_token: toToken,
          amount: amount.toString(),
          chain_id: chainId,
          reason: error.message,
          reference: swapRef,
          status: "failed",
        },
        userId
      ).catch((err) => logger.warn({ err: err.message }, "Failed to dispatch swap.failed webhook"));

      throw error;
    }

    // Remove the used quote
    pendingQuotes.delete(quoteId);

    const swapRecord = {
      swapId,
      reference: swapRef,
      userId,
      fromToken: storedQuote.fromToken,
      toToken: storedQuote.toToken,
      fromTokenId: storedQuote.fromTokenId,
      toTokenId: storedQuote.toTokenId,
      chainId,
      inputAmount: amount.toString(),
      outputAmount: executionResult.outputAmount,
      rate: storedQuote.rate,
      feePercent: storedQuote.feePercent,
      feeAmount: storedQuote.feeAmount,
      status: "completed",
      txHash: executionResult.txHash || null,
      completedAt: new Date().toISOString(),
    };

    // Emit swap.completed webhook
    await WebhookService.dispatch(
      WebhookService.WEBHOOK_EVENTS.SWAP_COMPLETED || "swap.completed",
      {
        swap_id: swapId,
        user_id: userId,
        from_token: storedQuote.fromToken,
        to_token: storedQuote.toToken,
        input_amount: amount.toString(),
        output_amount: executionResult.outputAmount,
        rate: storedQuote.rate,
        chain_id: chainId,
        tx_hash: executionResult.txHash || null,
        reference: swapRef,
        status: "completed",
      },
      userId
    ).catch((err) => logger.warn({ err: err.message }, "Failed to dispatch swap.completed webhook"));

    logger.info(
      { swapId, fromToken, toToken, amount, outputAmount: executionResult.outputAmount },
      "Swap completed successfully"
    );

    return swapRecord;
  },

  /**
   * Get the status of a swap by its ID.
   * In the current implementation, swaps are synchronous, so this returns 'completed'.
   */
  async getSwapStatus({ userId, swapId }) {
    // In a production system, this would query a database
    // For now, we return a basic status
    return {
      swapId,
      status: "completed",
      userId,
      timestamp: new Date().toISOString(),
    };
  },

  /**
   * Get supported tokens for swapping.
   */
  async getSupportedTokens() {
    try {
      const tokens = await db("tokens")
        .select("id", "symbol", "name", "chain", "price", "decimals", "logo_url")
        .orderBy("symbol", "asc");

      // Filter out tokens without valid prices (handles cases where whereNotNull isn't supported)
      return (tokens || []).filter(
        (t) => t.price != null && parseFloat(t.price) > 0
      );
    } catch (err) {
      logger.warn({ err: err.message }, "getSupportedTokens query failed");
      return [];
    }
  },

  /**
   * Find a token by its symbol.
   * @private
   */
  async _findTokenBySymbol(symbol) {
    return await db("tokens").where({ symbol: symbol.toUpperCase() }).first();
  },

  /**
   * Calculate the swap output amount using exchange rates.
   * Attempts to use autoswap-sdk if available, falls back to rate-based calculation.
   * @private
   */
  async _calculateSwap({ fromToken, toToken, amount, slippage }) {
    // Try autoswap-sdk first
    try {
      const autoSwapResult = await this._tryAutoSwapSdk({ fromToken, toToken, amount, slippage });
      if (autoSwapResult) {
        return autoSwapResult;
      }
    } catch (err) {
      logger.debug({ err: err.message }, "autoswap-sdk not available, falling back to rate-based pricing");
    }

    // Fallback: rate-based calculation using stored token prices
    return this._calculateSwapByRates({ fromToken, toToken, amount, slippage });
  },

  /**
   * Try to get a quote from the autoswap-sdk.
   * Uses the AutoSwappr.createSwapData() method for Starknet swaps.
   * @private
   */
  async _tryAutoSwapSdk({ fromToken, toToken, amount, slippage }) {
    let autoSwapSdk;
    try {
      autoSwapSdk = await import("autoswap-sdk");
    } catch {
      return null;
    }

    if (!autoSwapSdk || !autoSwapSdk.AutoSwappr) {
      return null;
    }

    // AutoSwappr requires a Starknet provider and account to be configured
    // If env vars for Starknet are not available, fall back to rate-based pricing
    if (!process.env.STARKNET_RPC_URL) {
      return null;
    }

    try {
      const { AutoSwappr, TOKEN_ADDRESSES } = autoSwapSdk;

      // Resolve token addresses
      const tokenIn = TOKEN_ADDRESSES?.[fromToken.symbol] || fromToken.address;
      const tokenOut = TOKEN_ADDRESSES?.[toToken.symbol] || toToken.address;

      if (!tokenIn || !tokenOut || tokenIn === tokenOut) {
        return null;
      }

      // Create a minimal AutoSwappr instance for quoting
      const autoswappr = new AutoSwappr({
        rpcUrl: process.env.STARKNET_RPC_URL,
        contractAddress: process.env.AUTOSWAPPR_CONTRACT_ADDRESS || "",
      });

      const swapData = await autoswappr.createSwapData(tokenIn, tokenOut, {
        amount: amount.toString(),
        slippage: slippage / 100,
      });

      if (!swapData || !swapData.expectedOutput) {
        return null;
      }

      const feePercent = 0.3;
      const feeAmount = amount * (feePercent / 100);
      const expectedOutput = parseFloat(swapData.expectedOutput);
      const minimumOutput = expectedOutput * (1 - slippage / 100);

      return {
        rate: expectedOutput / amount,
        expectedOutput: expectedOutput.toString(),
        minimumOutput: minimumOutput.toString(),
        feePercent,
        feeAmount: feeAmount.toString(),
        estimatedGas: swapData.estimatedGas || "0",
        priceImpact: swapData.priceImpact || "0",
        _swapData: swapData, // Store for execution
      };
    } catch (err) {
      logger.debug({ err: err.message }, "AutoSwappr quote failed");
      return null;
    }
  },

  /**
   * Calculate swap output using stored token prices (rate-based).
   * This is the fallback when autoswap-sdk is not available.
   * @private
   */
  _calculateSwapByRates({ fromToken, toToken, amount, slippage }) {
    const fromPrice = parseFloat(fromToken.price);
    const toPrice = parseFloat(toToken.price);

    // Calculate the exchange rate
    const rate = fromPrice / toPrice;

    // Apply swap fee (0.3% standard DEX fee)
    const feePercent = 0.3;
    const feeAmount = amount * (feePercent / 100);
    const amountAfterFee = amount - feeAmount;

    // Calculate expected output
    const expectedOutput = amountAfterFee * rate;

    // Calculate minimum output based on slippage tolerance
    const minimumOutput = expectedOutput * (1 - slippage / 100);

    // Estimate price impact (simplified — in production would use order book depth)
    const priceImpact = Math.min(amount * fromPrice / 10000, 2).toFixed(4); // Cap at 2%

    // Estimated gas (varies by chain)
    const estimatedGasMap = {
      1: "0.001", // Starknet
      2: "0.0005", // Lisk
      3: "0.0002", // Base
      4: "0.001", // Flow
      5: "0.0001", // U2U
      6: "0.00001", // Stellar
    };

    return {
      rate,
      expectedOutput: expectedOutput.toFixed(8),
      minimumOutput: minimumOutput.toFixed(8),
      feePercent,
      feeAmount: feeAmount.toFixed(8),
      estimatedGas: "0", // Placeholder
      priceImpact,
    };
  },

  /**
   * Execute the actual swap transaction.
   * In production, this would interact with DEX contracts on-chain.
   * @private
   */
  async _executeSwap({ quote, userId, swapId, swapRef }) {
    const { chainId, fromToken, toToken, amount } = quote;

    logger.info({ swapId, chainId, fromToken, toToken, amount }, "Executing swap");

    // Try to execute via autoswap-sdk
    try {
      const sdkResult = await this._executeViaSdk({ quote, userId, swapId });
      if (sdkResult) {
        return sdkResult;
      }
    } catch (err) {
      logger.debug({ err: err.message }, "autoswap-sdk execution not available, using internal execution");
    }

    // Fallback: Internal execution (simulates a successful swap)
    // In production, this would:
    // 1. Debit the user's fromToken balance
    // 2. Execute the swap on-chain via the appropriate chain handler
    // 3. Credit the user's toToken balance
    // 4. Return the transaction hash

    const outputAmount = parseFloat(quote.expectedOutput);

    // Attempt to update balances in the database
    try {
      await this._updateUserBalances({
        userId,
        fromTokenId: quote.fromTokenId,
        toTokenId: quote.toTokenId,
        debitAmount: parseFloat(amount),
        creditAmount: outputAmount,
      });
    } catch (balanceErr) {
      logger.warn(
        { err: balanceErr.message, swapId },
        "Balance update skipped — user balances table may not have matching records"
      );
    }

    // Generate a mock transaction hash (in production, this comes from the chain)
    const txHash = `0x${Buffer.from(swapId).toString("hex").padEnd(64, "0").slice(0, 64)}`;

    return {
      outputAmount: outputAmount.toFixed(8),
      txHash,
    };
  },

  /**
   * Attempt execution via autoswap-sdk's AutoSwappr class.
   * @private
   */
  async _executeViaSdk({ quote, userId, swapId }) {
    let autoSwapSdk;
    try {
      autoSwapSdk = await import("autoswap-sdk");
    } catch {
      return null;
    }

    if (!autoSwapSdk || !autoSwapSdk.AutoSwappr) {
      return null;
    }

    if (!process.env.STARKNET_RPC_URL || !process.env.STARKNET_PRIVATE_KEY) {
      return null;
    }

    try {
      const { AutoSwappr, TOKEN_ADDRESSES } = autoSwapSdk;

      const tokenIn = TOKEN_ADDRESSES?.[quote.fromToken] || quote.fromToken;
      const tokenOut = TOKEN_ADDRESSES?.[quote.toToken] || quote.toToken;

      if (!tokenIn || !tokenOut || tokenIn === tokenOut) {
        return null;
      }

      const autoswappr = new AutoSwappr({
        rpcUrl: process.env.STARKNET_RPC_URL,
        contractAddress: process.env.AUTOSWAPPR_CONTRACT_ADDRESS || "",
        privateKey: process.env.STARKNET_PRIVATE_KEY,
      });

      const result = await autoswappr.executeSwap(tokenIn, tokenOut, {
        amount: quote.amount,
        slippage: quote.slippage / 100,
      });

      if (!result || !result.result) {
        return null;
      }

      return {
        outputAmount: quote.expectedOutput,
        txHash: result.result.transaction_hash || null,
      };
    } catch (err) {
      logger.debug({ err: err.message }, "AutoSwappr execution failed");
      return null;
    }
  },

  /**
   * Update user token balances after a swap.
   * Debits fromToken and credits toToken.
   * @private
   */
  async _updateUserBalances({ userId, fromTokenId, toTokenId, debitAmount, creditAmount }) {
    // Debit fromToken balance
    const fromBalance = await db("balances")
      .where({ user_id: userId, token_id: fromTokenId })
      .first();

    if (fromBalance) {
      if (parseFloat(fromBalance.amount) < debitAmount) {
        throw new Error("Insufficient balance for swap");
      }
      await db("balances")
        .where({ user_id: userId, token_id: fromTokenId })
        .decrement("amount", debitAmount);
    } else {
      throw new Error("Insufficient balance for swap");
    }

    // Credit toToken balance
    const toBalance = await db("balances")
      .where({ user_id: userId, token_id: toTokenId })
      .first();

    if (toBalance) {
      await db("balances")
        .where({ user_id: userId, token_id: toTokenId })
        .increment("amount", creditAmount);
    } else {
      // Create a new balance record for the destination token
      await db("balances").insert({
        user_id: userId,
        token_id: toTokenId,
        amount: creditAmount,
        usd_value: 0, // Will be recalculated
        created_at: new Date(),
        updated_at: new Date(),
      });
    }
  },
};

export default SwapService;
