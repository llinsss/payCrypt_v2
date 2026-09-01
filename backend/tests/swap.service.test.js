import { afterEach, describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("../config/database.js", () => ({
  default: jest.fn(),
}));

jest.unstable_mockModule("../services/WebhookService.js", () => ({
  WEBHOOK_EVENTS: {
    SWAP_COMPLETED: "swap.completed",
    SWAP_FAILED: "swap.failed",
  },
  default: {
    dispatch: jest.fn(),
  },
}));

const { SwapService } = await import("../services/SwapService.js");

const tokenModel = {
  findById: jest.fn(),
  findBySymbol: jest.fn(),
};

const chainModel = {
  findById: jest.fn(),
};

const webhookService = {
  dispatch: jest.fn(),
};

const dbClient = jest.fn(() => {
  throw new Error("db table access not expected in this unit test");
});

describe("SwapService quotes", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a two-step quote using token prices", async () => {
    chainModel.findById.mockResolvedValue({ id: 1, symbol: "STRK", name: "Starknet" });
    tokenModel.findBySymbol.mockImplementation(async (symbol) => {
      const tokens = {
        STRK: { id: 1, symbol: "STRK", name: "Starknet", decimals: 18, price: 0.2, address: "0x1" },
        BASE: { id: 3, symbol: "BASE", name: "Base", decimals: 18, price: 1, address: "0x2" },
      };
      return tokens[symbol];
    });

    const service = new SwapService({ dbClient, tokenModel, chainModel, webhookService, quoteTtlMs: 60_000 });

    const quote = await service.createQuote({
      userId: 9,
      fromToken: "STRK",
      toToken: "BASE",
      amount: "10",
      chainId: 1,
      slippageBps: 100,
    });

    expect(quote.quoteId).toEqual(expect.any(String));
    expect(quote.requiresConfirmation).toBe(true);
    expect(quote.fromToken).toBe("STRK");
    expect(quote.toToken).toBe("BASE");
    expect(quote.amountIn).toBe("10");
    expect(quote.amountOut).toBe("2");
    expect(quote.minAmountOut).toBe("1.98");
    expect(quote.provider).toBe("internal-price-oracle");
  });

  it("fails when the quote token pair uses the same token", async () => {
    chainModel.findById.mockResolvedValue({ id: 1, symbol: "STRK", name: "Starknet" });
    tokenModel.findBySymbol.mockResolvedValue({ id: 1, symbol: "STRK", decimals: 18, price: 0.2 });

    const service = new SwapService({ dbClient, tokenModel, chainModel, webhookService });

    await expect(
      service.createQuote({
        userId: 9,
        fromToken: "STRK",
        toToken: "STRK",
        amount: "10",
        chainId: 1,
      }),
    ).rejects.toMatchObject({ code: "SAME_TOKEN", status: 400 });
  });

  it("fails when a quote is confirmed after it expires", async () => {
    chainModel.findById.mockResolvedValue({ id: 1, symbol: "STRK", name: "Starknet" });
    tokenModel.findBySymbol.mockImplementation(async (symbol) => ({
      id: symbol === "STRK" ? 1 : 2,
      symbol,
      decimals: 18,
      price: symbol === "STRK" ? 0.2 : 1,
    }));

    const service = new SwapService({ dbClient, tokenModel, chainModel, webhookService, quoteTtlMs: 1 });
    const quote = await service.createQuote({
      userId: 9,
      fromToken: "STRK",
      toToken: "BASE",
      amount: "10",
      chainId: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    await expect(service.confirmSwap({ userId: 9, quoteId: quote.quoteId })).rejects.toMatchObject({
      code: "QUOTE_NOT_FOUND",
      status: 404,
    });
  });
});
