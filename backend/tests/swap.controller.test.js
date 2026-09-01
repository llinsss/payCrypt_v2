import { afterEach, describe, expect, it, jest } from "@jest/globals";

const mockCreateQuote = jest.fn();
const mockConfirmSwap = jest.fn();

jest.unstable_mockModule("../services/SwapService.js", () => ({
  default: {
    createQuote: mockCreateQuote,
    confirmSwap: mockConfirmSwap,
  },
}));

const { handleSwap } = await import("../controllers/SwapController.js");

const mockResponse = () => {
  const res = {
    statusCode: 200,
    body: null,
  };
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
};

const mockRequest = (body, user = { id: 7 }) => ({
  body,
  user,
  get: jest.fn(() => null),
});

describe("SwapController", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns a quote for the first step of a swap", async () => {
    const quote = {
      quoteId: "6f6e886d-f5dd-4f4a-983a-764f57d4c7aa",
      fromToken: "STRK",
      toToken: "BASE",
      amountIn: "10",
      amountOut: "1.43654",
      requiresConfirmation: true,
    };
    mockCreateQuote.mockResolvedValue(quote);

    const req = mockRequest({
      fromToken: "STRK",
      toToken: "BASE",
      amount: "10",
      chainId: "STRK",
      slippageBps: 50,
    });
    const res = mockResponse();

    await handleSwap(req, res);

    expect(mockCreateQuote).toHaveBeenCalledWith({
      userId: 7,
      fromToken: "STRK",
      toToken: "BASE",
      amount: "10",
      chainId: "STRK",
      slippageBps: 50,
      slippagePercent: undefined,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      success: true,
      step: "quote",
      message: "Quote generated. Confirm with action=confirm and quoteId before it expires.",
      data: quote,
    });
  });

  it("confirms and executes a previously generated quote", async () => {
    const execution = {
      status: "completed",
      txHash: "ledger_123",
      transaction: { id: 44, type: "swap" },
    };
    mockConfirmSwap.mockResolvedValue(execution);

    const req = mockRequest({
      action: "confirm",
      quoteId: "6f6e886d-f5dd-4f4a-983a-764f57d4c7aa",
    });
    req.get = jest.fn((header) => (header === "Idempotency-Key" ? "idem-1" : null));
    const res = mockResponse();

    await handleSwap(req, res);

    expect(mockConfirmSwap).toHaveBeenCalledWith({
      userId: 7,
      quoteId: "6f6e886d-f5dd-4f4a-983a-764f57d4c7aa",
      idempotencyKey: "idem-1",
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      success: true,
      step: "confirm",
      message: "Swap completed successfully",
      data: execution,
    });
  });

  it("maps swap failures to the service-provided HTTP status", async () => {
    const error = new Error("Insufficient wallet balance");
    error.status = 422;
    error.code = "INSUFFICIENT_BALANCE";
    mockConfirmSwap.mockRejectedValue(error);

    const req = mockRequest({
      action: "confirm",
      quoteId: "6f6e886d-f5dd-4f4a-983a-764f57d4c7aa",
    });
    const res = mockResponse();

    await handleSwap(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.body).toEqual({
      success: false,
      error: "Insufficient wallet balance",
      code: "INSUFFICIENT_BALANCE",
    });
  });

  it("rejects unauthenticated swap requests", async () => {
    const req = mockRequest({ fromToken: "STRK" }, null);
    const res = mockResponse();

    await handleSwap(req, res);

    expect(mockCreateQuote).not.toHaveBeenCalled();
    expect(mockConfirmSwap).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({
      success: false,
      error: "Authenticated user is required",
    });
  });
});
