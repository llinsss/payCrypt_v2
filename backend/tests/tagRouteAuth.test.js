import fs from "fs";
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const mockFindByTag = jest.fn();
const mockGetByTag = jest.fn();
const mockCountByTag = jest.fn();
const mockGetTransactionHistory = jest.fn();

jest.unstable_mockModule("../models/User.js", () => ({
  default: {
    findByTag: mockFindByTag,
  },
}));

jest.unstable_mockModule("../models/Transaction.js", () => ({
  default: {
    getByTag: mockGetByTag,
    countByTag: mockCountByTag,
  },
}));

jest.unstable_mockModule("../services/PaymentService.js", () => ({
  default: {
    getTransactionHistory: mockGetTransactionHistory,
  },
}));

jest.unstable_mockModule("../services/ReceiptService.js", () => ({
  default: {},
}));

jest.unstable_mockModule("../services/LockService.js", () => ({
  default: {},
}));

const { getTransactionsByTag, getPaymentHistory } = await import("../controllers/transactionController.js");

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe("tag route guards", () => {
  it("requires authenticate and userRateLimiter on both tag routes", () => {
    const src = fs.readFileSync("backend/routes/transactions.js", "utf8");

    expect(src).toContain('router.get("/tag/:tag", authenticate, userRateLimiter');
    expect(src).toContain('router.get("/tag/:tag/history", authenticate, userRateLimiter');
  });
});

describe("getTransactionsByTag ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when the authenticated user does not own the tag", async () => {
    mockFindByTag.mockResolvedValue({ id: 7 });

    const req = {
      params: { tag: "alice" },
      query: {},
      user: { id: 9 },
    };
    const res = createRes();

    await getTransactionsByTag(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Access denied." });
    expect(mockGetByTag).not.toHaveBeenCalled();
  });

  it("returns data when the authenticated user owns the tag", async () => {
    mockFindByTag.mockResolvedValue({ id: 7 });
    mockGetByTag.mockResolvedValue([{ id: 1 }]);
    mockCountByTag.mockResolvedValue(1);

    const req = {
      params: { tag: "alice" },
      query: {},
      user: { id: 7 },
    };
    const res = createRes();

    await getTransactionsByTag(req, res);

    expect(res.json).toHaveBeenCalledWith({
      data: [{ id: 1 }],
      pagination: {
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      },
    });
  });
});

describe("getPaymentHistory ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when the authenticated user does not own the tag", async () => {
    mockFindByTag.mockResolvedValue({ id: 7 });

    const req = {
      params: { tag: "alice" },
      query: {},
      user: { id: 9 },
    };
    const res = createRes();

    await getPaymentHistory(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Access denied." });
    expect(mockGetTransactionHistory).not.toHaveBeenCalled();
  });

  it("returns transaction history when the authenticated user owns the tag", async () => {
    mockFindByTag.mockResolvedValue({ id: 7 });
    mockGetTransactionHistory.mockResolvedValue([{ id: 11 }]);

    const req = {
      params: { tag: "alice" },
      query: {},
      user: { id: 7 },
    };
    const res = createRes();

    await getPaymentHistory(req, res);

    expect(mockGetTransactionHistory).toHaveBeenCalledWith("alice", expect.any(Object));
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [{ id: 11 }],
      count: 1,
    });
  });
});
