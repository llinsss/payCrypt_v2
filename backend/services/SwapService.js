import axios from "axios";
import BigNumber from "bignumber.js";
import crypto from "crypto";

import db from "../config/database.js";
import Chain from "../models/Chain.js";
import Token from "../models/Token.js";
import WebhookService, { WEBHOOK_EVENTS } from "./WebhookService.js";

const DEFAULT_QUOTE_TTL_MS = 2 * 60 * 1000;
const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
const CHAIN_ALIASES = new Map(
  Object.entries({
    base: "base",
    "8453": "base",
    "84532": "base",
    lisk: "lisk",
    lsk: "lisk",
    "1135": "lisk",
    "4202": "lisk",
    starknet: "starknet",
    strk: "starknet",
    sn_main: "starknet",
    sn_sepolia: "starknet",
    flow: "flow",
    "747": "flow",
    u2u: "u2u",
    stellar: "stellar",
    xlm: "stellar",
  }),
);

const NUMERIC_PATTERN = /^\d+$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]+$/;

export class SwapError extends Error {
  constructor(message, status = 400, code = "SWAP_ERROR", details = null) {
    super(message);
    this.name = "SwapError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const nowIso = () => new Date().toISOString();

const asStringId = (insertResult) => {
  if (Array.isArray(insertResult)) return asStringId(insertResult[0]);
  if (insertResult && typeof insertResult === "object") {
    return insertResult.id ?? insertResult.ID;
  }
  return insertResult;
};

const normalizeDecimal = (value, decimalPlaces = 18) =>
  new BigNumber(value).decimalPlaces(decimalPlaces, BigNumber.ROUND_DOWN).toFixed();

const toBigNumber = (value, fieldName = "amount") => {
  const bn = new BigNumber(value);
  if (!bn.isFinite() || !bn.isPositive()) {
    throw new SwapError(`${fieldName} must be greater than 0`, 400, "INVALID_AMOUNT");
  }
  return bn;
};

const quoteResponse = (quote) => ({
  quoteId: quote.quoteId,
  expiresAt: quote.expiresAt,
  chainId: quote.chain.input,
  chain: {
    id: quote.chain.id,
    key: quote.chain.key,
    name: quote.chain.name,
    symbol: quote.chain.symbol,
  },
  fromToken: quote.fromToken.symbol,
  toToken: quote.toToken.symbol,
  amountIn: quote.amountIn,
  amountOut: quote.amountOut,
  minAmountOut: quote.minAmountOut,
  exchangeRate: quote.exchangeRate,
  slippageBps: quote.slippageBps,
  priceImpactBps: quote.priceImpactBps,
  provider: quote.provider,
  route: quote.route,
  fee: quote.fee,
  requiresConfirmation: true,
});

export class SwapService {
  constructor({
    dbClient = db,
    tokenModel = Token,
    chainModel = Chain,
    webhookService = WebhookService,
    httpClient = axios,
    quoteTtlMs = Number(process.env.SWAP_QUOTE_TTL_MS || DEFAULT_QUOTE_TTL_MS),
  } = {}) {
    this.db = dbClient;
    this.Token = tokenModel;
    this.Chain = chainModel;
    this.webhookService = webhookService;
    this.http = httpClient;
    this.quoteTtlMs = quoteTtlMs;
    this.quotes = new Map();
  }

  async createQuote({ userId, fromToken, toToken, amount, chainId, slippageBps, slippagePercent }) {
    this.pruneExpiredQuotes();

    const inputAmount = toBigNumber(amount);
    const computedSlippageBps = this.normalizeSlippage(slippageBps, slippagePercent);

    const [chain, from, to] = await Promise.all([
      this.resolveChain(chainId),
      this.resolveToken(fromToken),
      this.resolveToken(toToken),
    ]);

    if (from.id === to.id || from.symbol.toLowerCase() === to.symbol.toLowerCase()) {
      throw new SwapError("fromToken and toToken must be different", 400, "SAME_TOKEN");
    }

    const aggregatorQuote = await this.tryAggregatorQuote({
      chain,
      fromToken: from,
      toToken: to,
      amount: inputAmount,
      slippageBps: computedSlippageBps,
      userId,
    });

    const calculated = aggregatorQuote || this.calculatePriceQuote({
      fromToken: from,
      toToken: to,
      amount: inputAmount,
      slippageBps: computedSlippageBps,
    });

    const quoteId = crypto.randomUUID();
    const createdAt = Date.now();
    const expiresAt = new Date(createdAt + this.quoteTtlMs).toISOString();

    const quote = {
      quoteId,
      userId,
      createdAt,
      expiresAt,
      used: false,
      chain,
      fromToken: from,
      toToken: to,
      amountIn: normalizeDecimal(inputAmount),
      amountOut: normalizeDecimal(calculated.amountOut),
      minAmountOut: normalizeDecimal(calculated.minAmountOut),
      exchangeRate: normalizeDecimal(calculated.exchangeRate),
      slippageBps: computedSlippageBps,
      priceImpactBps: calculated.priceImpactBps ?? 0,
      provider: calculated.provider,
      route: calculated.route,
      fee: calculated.fee,
      rawQuote: calculated.rawQuote ?? null,
    };

    this.quotes.set(quoteId, quote);
    return quoteResponse(quote);
  }

  async confirmSwap({ userId, quoteId, idempotencyKey = null }) {
    const quote = this.getStoredQuote(quoteId, userId);

    try {
      const execution = await this.executeWithProvider(quote);
      const result = await this.applyLedgerSwap({ quote, execution, idempotencyKey });

      quote.used = true;
      this.quotes.delete(quote.quoteId);

      await this.emitWebhook(WEBHOOK_EVENTS.SWAP_COMPLETED, {
        quote_id: quote.quoteId,
        transaction_id: result.transaction.id,
        user_id: userId,
        tx_hash: result.txHash,
        provider: result.provider,
        chain_id: quote.chain.input,
        chain: quote.chain.key,
        from_token: quote.fromToken.symbol,
        to_token: quote.toToken.symbol,
        amount_in: quote.amountIn,
        amount_out: quote.amountOut,
        min_amount_out: quote.minAmountOut,
      }, userId);

      return {
        quote: quoteResponse(quote),
        transaction: result.transaction,
        txHash: result.txHash,
        provider: result.provider,
        status: "completed",
      };
    } catch (error) {
      await this.emitWebhook(WEBHOOK_EVENTS.SWAP_FAILED, {
        quote_id: quote.quoteId,
        user_id: userId,
        chain_id: quote.chain.input,
        chain: quote.chain.key,
        from_token: quote.fromToken.symbol,
        to_token: quote.toToken.symbol,
        amount_in: quote.amountIn,
        reason: error.message,
        code: error.code || "SWAP_FAILED",
      }, userId);

      throw error;
    }
  }

  normalizeSlippage(slippageBps, slippagePercent) {
    if (slippageBps !== undefined && slippageBps !== null) {
      return Number(slippageBps);
    }
    if (slippagePercent !== undefined && slippagePercent !== null) {
      return Math.round(Number(slippagePercent) * 100);
    }
    return DEFAULT_SLIPPAGE_BPS;
  }

  pruneExpiredQuotes() {
    const now = Date.now();
    for (const [quoteId, quote] of this.quotes.entries()) {
      if (quote.createdAt + this.quoteTtlMs <= now || quote.used) {
        this.quotes.delete(quoteId);
      }
    }
  }

  getStoredQuote(quoteId, userId) {
    this.pruneExpiredQuotes();
    const quote = this.quotes.get(quoteId);

    if (!quote) {
      throw new SwapError("Swap quote not found or expired", 404, "QUOTE_NOT_FOUND");
    }

    if (quote.userId && userId && String(quote.userId) !== String(userId)) {
      throw new SwapError("Swap quote does not belong to this user", 403, "QUOTE_FORBIDDEN");
    }

    if (quote.used) {
      throw new SwapError("Swap quote has already been used", 409, "QUOTE_ALREADY_USED");
    }

    if (quote.createdAt + this.quoteTtlMs <= Date.now()) {
      this.quotes.delete(quoteId);
      throw new SwapError("Swap quote has expired", 410, "QUOTE_EXPIRED");
    }

    return quote;
  }

  async resolveChain(chainId) {
    const input = String(chainId).trim();
    const lowered = input.toLowerCase();
    let chain = null;

    if (NUMERIC_PATTERN.test(input)) {
      try {
        chain = await this.Chain.findById(Number(input));
      } catch {
        chain = null;
      }
    }

    if (!chain) {
      try {
        chain = await this.db("chains")
          .whereRaw("LOWER(symbol) = ? OR LOWER(name) = ?", [lowered, lowered])
          .first();
      } catch {
        chain = null;
      }
    }

    const symbolOrName = chain?.symbol || chain?.name || input;
    const key = CHAIN_ALIASES.get(String(symbolOrName).toLowerCase()) || CHAIN_ALIASES.get(lowered) || String(symbolOrName).toLowerCase();

    if (!chain && !CHAIN_ALIASES.has(lowered)) {
      throw new SwapError(`Unsupported or inactive chain: ${chainId}`, 400, "UNSUPPORTED_CHAIN");
    }

    return {
      input,
      id: chain?.id ?? (NUMERIC_PATTERN.test(input) && Number(input) <= 10_000 ? Number(input) : null),
      key,
      name: chain?.name || key,
      symbol: chain?.symbol || String(symbolOrName).toUpperCase(),
      raw: chain,
    };
  }

  async resolveToken(identifier) {
    const raw = String(identifier).trim();
    const normalized = raw.toUpperCase();
    let token = null;

    if (NUMERIC_PATTERN.test(raw)) {
      token = await this.Token.findById(Number(raw));
    }

    if (!token && !ADDRESS_PATTERN.test(raw)) {
      token = await this.Token.findBySymbol(normalized);
    }

    if (!token) {
      try {
        const lowered = raw.toLowerCase();
        token = await this.db("tokens")
          .whereRaw("LOWER(symbol) = ? OR LOWER(address) = ? OR LOWER(name) = ? OR LOWER(token) = ?", [
            lowered,
            lowered,
            lowered,
            lowered,
          ])
          .first();
      } catch {
        token = null;
      }
    }

    if (!token) {
      throw new SwapError(`Unsupported token: ${identifier}`, 400, "UNSUPPORTED_TOKEN");
    }

    const price = new BigNumber(token.price ?? 0);
    if (!price.isFinite() || price.isNegative()) {
      throw new SwapError(`Invalid price for token ${token.symbol || identifier}`, 400, "INVALID_TOKEN_PRICE");
    }

    return {
      ...token,
      id: token.id,
      symbol: String(token.symbol || raw).toUpperCase(),
      address: token.address,
      decimals: Number(token.decimals ?? 18),
      price: price.isZero() ? new BigNumber(1) : price,
    };
  }

  calculatePriceQuote({ fromToken, toToken, amount, slippageBps }) {
    const grossOut = amount.multipliedBy(fromToken.price).dividedBy(toToken.price);
    const minAmountOut = grossOut.multipliedBy(10_000 - slippageBps).dividedBy(10_000);
    const exchangeRate = fromToken.price.dividedBy(toToken.price);

    return {
      amountOut: grossOut,
      minAmountOut,
      exchangeRate,
      priceImpactBps: 0,
      provider: "internal-price-oracle",
      route: [fromToken.symbol, toToken.symbol],
      fee: {
        amount: "0",
        token: fromToken.symbol,
      },
    };
  }

  async tryAggregatorQuote(payload) {
    const baseUrl = process.env.SWAP_AGGREGATOR_URL;
    if (!baseUrl) return null;

    try {
      const response = await this.http.post(
        `${baseUrl.replace(/\/$/, "")}/quote`,
        this.toProviderPayload(payload),
        this.providerRequestConfig(),
      );

      const data = response.data?.data || response.data;
      const amountOut = toBigNumber(data.amountOut || data.toAmount || data.outputAmount, "amountOut");
      const minAmountOut = data.minAmountOut
        ? toBigNumber(data.minAmountOut, "minAmountOut")
        : amountOut.multipliedBy(10_000 - payload.slippageBps).dividedBy(10_000);

      return {
        amountOut,
        minAmountOut,
        exchangeRate: amountOut.dividedBy(payload.amount),
        priceImpactBps: Number(data.priceImpactBps || data.priceImpact || 0),
        provider: data.provider || "dex-aggregator",
        route: data.route || [payload.fromToken.symbol, payload.toToken.symbol],
        fee: data.fee || { amount: "0", token: payload.fromToken.symbol },
        rawQuote: data,
      };
    } catch (error) {
      if (process.env.SWAP_REQUIRE_AGGREGATOR === "true") {
        throw new SwapError(
          `Swap quote provider unavailable: ${error.message}`,
          503,
          "QUOTE_PROVIDER_UNAVAILABLE",
        );
      }
      return null;
    }
  }

  async executeWithProvider(quote) {
    if (quote.chain.key === "starknet" && this.canUseAutoswapSdk(quote)) {
      return this.executeWithAutoswapSdk(quote);
    }

    if (process.env.SWAP_AGGREGATOR_URL) {
      return this.executeWithAggregator(quote);
    }

    return {
      provider: "internal-ledger",
      txHash: `ledger_${crypto.randomUUID()}`,
      raw: { mode: "ledger" },
    };
  }

  canUseAutoswapSdk(quote) {
    return Boolean(
      process.env.AUTOSWAPPR_CONTRACT_ADDRESS &&
        (process.env.STARKNET_RPC_URL || process.env.AUTOSWAPPR_RPC_URL) &&
        (process.env.STARKNET_ACCOUNT_ADDRESS || process.env.AUTOSWAPPR_ACCOUNT_ADDRESS) &&
        (process.env.STARKNET_PRIVATE_KEY || process.env.AUTOSWAPPR_PRIVATE_KEY) &&
        this.resolveAutoswapAddress(quote.fromToken) &&
        this.resolveAutoswapAddress(quote.toToken),
    );
  }

  resolveAutoswapAddress(token) {
    if (token.address && ADDRESS_PATTERN.test(token.address)) return token.address;
    const symbol = String(token.symbol || "").toUpperCase();
    const fallback = {
      STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
      ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
      USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
      USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
      WBTC: "0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac",
    };
    return fallback[symbol] || null;
  }

  async executeWithAutoswapSdk(quote) {
    try {
      const module = await import("autoswap-sdk");
      const sdk = module.default || module;
      const { AutoSwappr } = sdk;
      const autoswappr = new AutoSwappr({
        contractAddress: process.env.AUTOSWAPPR_CONTRACT_ADDRESS,
        rpcUrl: process.env.AUTOSWAPPR_RPC_URL || process.env.STARKNET_RPC_URL,
        accountAddress: process.env.AUTOSWAPPR_ACCOUNT_ADDRESS || process.env.STARKNET_ACCOUNT_ADDRESS,
        privateKey: process.env.AUTOSWAPPR_PRIVATE_KEY || process.env.STARKNET_PRIVATE_KEY,
      });

      const result = await autoswappr.executeSwap(
        this.resolveAutoswapAddress(quote.fromToken),
        this.resolveAutoswapAddress(quote.toToken),
        { amount: quote.amountIn },
      );

      const txHash = result?.result?.transaction_hash || result?.result?.transactionHash;
      return {
        provider: "autoswap-sdk",
        txHash: txHash || `autoswap_${crypto.randomUUID()}`,
        raw: result,
      };
    } catch (error) {
      throw new SwapError(`Autoswap execution failed: ${error.message}`, 502, "AUTOSWAP_FAILED");
    }
  }

  async executeWithAggregator(quote) {
    const baseUrl = process.env.SWAP_AGGREGATOR_URL;
    try {
      const response = await this.http.post(
        `${baseUrl.replace(/\/$/, "")}/swap`,
        {
          quoteId: quote.quoteId,
          rawQuote: quote.rawQuote,
          ...this.toProviderPayload({
            chain: quote.chain,
            fromToken: quote.fromToken,
            toToken: quote.toToken,
            amount: new BigNumber(quote.amountIn),
            slippageBps: quote.slippageBps,
            userId: quote.userId,
          }),
        },
        this.providerRequestConfig(),
      );
      const data = response.data?.data || response.data;
      return {
        provider: data.provider || "dex-aggregator",
        txHash: data.txHash || data.transactionHash || data.hash,
        raw: data,
      };
    } catch (error) {
      throw new SwapError(`Swap execution provider unavailable: ${error.message}`, 503, "SWAP_PROVIDER_UNAVAILABLE");
    }
  }

  toProviderPayload({ chain, fromToken, toToken, amount, slippageBps, userId }) {
    return {
      userId,
      chainId: chain.input,
      chain: chain.key,
      fromToken: {
        id: fromToken.id,
        symbol: fromToken.symbol,
        address: fromToken.address,
        decimals: fromToken.decimals,
      },
      toToken: {
        id: toToken.id,
        symbol: toToken.symbol,
        address: toToken.address,
        decimals: toToken.decimals,
      },
      amount: amount.toFixed(),
      slippageBps,
    };
  }

  providerRequestConfig() {
    const headers = { "Content-Type": "application/json" };
    if (process.env.SWAP_AGGREGATOR_API_KEY) {
      headers.Authorization = `Bearer ${process.env.SWAP_AGGREGATOR_API_KEY}`;
    }
    return {
      timeout: Number(process.env.SWAP_PROVIDER_TIMEOUT_MS || 15_000),
      headers,
    };
  }

  async applyLedgerSwap({ quote, execution, idempotencyKey }) {
    const amountIn = new BigNumber(quote.amountIn);
    const amountOut = new BigNumber(quote.amountOut);

    if (!amountIn.isPositive() || !amountOut.isPositive()) {
      throw new SwapError("Invalid quote amount", 400, "INVALID_QUOTE_AMOUNT");
    }

    const result = await this.db.transaction(async (trx) => {
      const fromBalance = await trx("balances")
        .where({ user_id: quote.userId, token_id: quote.fromToken.id })
        .forUpdate()
        .first();

      if (!fromBalance) {
        throw new SwapError("Source balance not found", 404, "BALANCE_NOT_FOUND");
      }

      const currentFromAmount = new BigNumber(fromBalance.amount || 0);
      if (currentFromAmount.lt(amountIn)) {
        throw new SwapError("Insufficient wallet balance", 422, "INSUFFICIENT_BALANCE");
      }

      let toBalance = await trx("balances")
        .where({ user_id: quote.userId, token_id: quote.toToken.id })
        .forUpdate()
        .first();

      if (!toBalance) {
        const inserted = await trx("balances")
          .insert({
            user_id: quote.userId,
            token_id: quote.toToken.id,
            amount: "0",
            usd_value: "0",
            created_at: this.db.fn.now(),
            updated_at: this.db.fn.now(),
          })
          .returning("id");
        toBalance = {
          id: asStringId(inserted),
          amount: "0",
          usd_value: "0",
        };
      }

      const newFromAmount = currentFromAmount.minus(amountIn);
      const newToAmount = new BigNumber(toBalance.amount || 0).plus(amountOut);

      await trx("balances")
        .where({ id: fromBalance.id })
        .update({
          amount: normalizeDecimal(newFromAmount),
          usd_value: normalizeDecimal(newFromAmount.multipliedBy(quote.fromToken.price)),
          updated_at: this.db.fn.now(),
        });

      await trx("balances")
        .where({ id: toBalance.id })
        .update({
          amount: normalizeDecimal(newToAmount),
          usd_value: normalizeDecimal(newToAmount.multipliedBy(quote.toToken.price)),
          updated_at: this.db.fn.now(),
        });

      const txPayload = {
        user_id: quote.userId,
        token_id: quote.fromToken.id,
        chain_id: quote.chain.id,
        reference: `swap-${quote.quoteId}`,
        type: "swap",
        status: "completed",
        tx_hash: execution.txHash || `swap_${quote.quoteId}`,
        usd_value: normalizeDecimal(amountIn.multipliedBy(quote.fromToken.price)),
        amount: normalizeDecimal(amountIn),
        timestamp: nowIso(),
        from_address: quote.fromToken.symbol,
        to_address: quote.toToken.symbol,
        description: `Swap ${quote.amountIn} ${quote.fromToken.symbol} to ${quote.amountOut} ${quote.toToken.symbol}`,
        metadata: {
          quoteId: quote.quoteId,
          provider: execution.provider,
          chain: quote.chain.key,
          fromToken: quote.fromToken.symbol,
          toToken: quote.toToken.symbol,
          amountIn: quote.amountIn,
          amountOut: quote.amountOut,
          minAmountOut: quote.minAmountOut,
          slippageBps: quote.slippageBps,
          execution: execution.raw || null,
        },
        idempotency_key: idempotencyKey || null,
        updated_at: this.db.fn.now(),
      };

      const insertedTx = await trx("transactions").insert(txPayload).returning("id");
      const transactionId = asStringId(insertedTx);
      const transaction = await trx("transactions").where({ id: transactionId }).first();

      return {
        txHash: txPayload.tx_hash,
        provider: execution.provider,
        transaction,
      };
    });

    return result;
  }

  async emitWebhook(eventType, payload, userId) {
    try {
      await this.webhookService.dispatch(eventType, payload, userId);
    } catch (error) {
      console.error(`Failed to emit ${eventType} webhook:`, error.message);
    }
  }
}

export default new SwapService();
