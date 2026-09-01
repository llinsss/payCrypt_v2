import { jest } from "@jest/globals";

const mockCreate   = jest.fn();
const mockGetAll   = jest.fn();
const mockFindById = jest.fn();
const mockUpdate   = jest.fn();
const mockDelete   = jest.fn();

jest.unstable_mockModule("../models/Token.js", () => ({
  default: { create: mockCreate, getAll: mockGetAll, findById: mockFindById, update: mockUpdate, delete: mockDelete },
}));

const { createToken, getTokens, getTokenById, updateToken, deleteToken } =
  await import("../controllers/tokenController.js");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

describe("getTokens - pagination (#561)", () => {
  beforeEach(() => mockGetAll.mockResolvedValue([{ id: 1 }]));
  afterEach(() => jest.clearAllMocks());

  test("default page=1 limit=10 produces offset=0", async () => {
    await getTokens({ query: { page: 1, limit: 10 } }, mockRes());
    expect(mockGetAll).toHaveBeenCalledWith(10, 0);
  });

  test("page=2 limit=25 produces offset=25", async () => {
    await getTokens({ query: { page: 2, limit: 25 } }, mockRes());
    expect(mockGetAll).toHaveBeenCalledWith(25, 25);
  });

  test("max limit=100 is accepted", async () => {
    await getTokens({ query: { page: 1, limit: 100 } }, mockRes());
    expect(mockGetAll).toHaveBeenCalledWith(100, 0);
  });

  test("max page=10000 limit=10 produces offset=99990", async () => {
    await getTokens({ query: { page: 10000, limit: 10 } }, mockRes());
    expect(mockGetAll).toHaveBeenCalledWith(10, 99990);
  });

  test("returns 500 when model throws", async () => {
    mockGetAll.mockRejectedValue(new Error("db error"));
    const res = mockRes();
    await getTokens({ query: { page: 1, limit: 10 } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("createToken - mass assignment (#563)", () => {
  afterEach(() => jest.clearAllMocks());

  test("passes whitelisted body to Token.create and returns 201", async () => {
    const body = { symbol: "USDC", name: "USD Coin", decimals: 6, chain: "evm", is_active: true };
    mockCreate.mockResolvedValue({ id: 1, ...body });
    const res = mockRes();
    await createToken({ body }, res);
    expect(mockCreate).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("controller does not inject extra fields beyond req.body", async () => {
    const body = { symbol: "ETH", name: "Ether", decimals: 18, chain: "evm" };
    mockCreate.mockResolvedValue({ id: 2, ...body });
    await createToken({ body }, mockRes());
    expect(mockCreate).not.toHaveBeenCalledWith(expect.objectContaining({ admin: true }));
    expect(mockCreate).not.toHaveBeenCalledWith(expect.objectContaining({ role: expect.anything() }));
  });

  test("returns 500 on model error", async () => {
    mockCreate.mockRejectedValue(new Error("fail"));
    const res = mockRes();
    await createToken({ body: { symbol: "X", name: "X", decimals: 0, chain: "evm" } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("updateToken - mass assignment (#563)", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 404 when token not found", async () => {
    mockFindById.mockResolvedValue(null);
    const res = mockRes();
    await updateToken({ params: { id: "99" }, body: { name: "X" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Token not found" });
  });

  test("passes only validated body to Token.update", async () => {
    mockFindById.mockResolvedValue({ id: 1 });
    mockUpdate.mockResolvedValue({ id: 1, is_active: false });
    const body = { is_active: false };
    const res = mockRes();
    await updateToken({ params: { id: "1" }, body }, res);
    expect(mockUpdate).toHaveBeenCalledWith("1", body);
  });

  test("does not forward unsafe fields to model", async () => {
    mockFindById.mockResolvedValue({ id: 1 });
    mockUpdate.mockResolvedValue({ id: 1 });
    const body = { decimals: 8 };
    await updateToken({ params: { id: "1" }, body }, mockRes());
    const called = mockUpdate.mock.calls[0][1];
    expect(Object.keys(called)).not.toContain("__proto__");
    expect(Object.keys(called)).not.toContain("constructor");
  });
});

describe("getTokenById", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 404 for unknown id", async () => {
    mockFindById.mockResolvedValue(null);
    const res = mockRes();
    await getTokenById({ params: { id: "999" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Token not found" });
  });

  test("returns token when found", async () => {
    const token = { id: 1, symbol: "USDC" };
    mockFindById.mockResolvedValue(token);
    const res = mockRes();
    await getTokenById({ params: { id: "1" } }, res);
    expect(res.json).toHaveBeenCalledWith(token);
  });
});

describe("deleteToken", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 404 when token not found", async () => {
    mockFindById.mockResolvedValue(null);
    const res = mockRes();
    await deleteToken({ params: { id: "99" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("deletes and returns success message", async () => {
    mockFindById.mockResolvedValue({ id: 1 });
    mockDelete.mockResolvedValue(1);
    const res = mockRes();
    await deleteToken({ params: { id: "1" } }, res);
    expect(res.json).toHaveBeenCalledWith({ message: "Token deleted successfully" });
  });
});