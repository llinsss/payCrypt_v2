import { jest } from "@jest/globals";

const mockCreate   = jest.fn();
const mockGetAll   = jest.fn();
const mockFindById = jest.fn();
const mockUpdate   = jest.fn();
const mockDelete   = jest.fn();

jest.unstable_mockModule("../models/Chain.js", () => ({
  default: { create: mockCreate, getAll: mockGetAll, findById: mockFindById, update: mockUpdate, delete: mockDelete },
}));

const { createChain, getChains, getChainById, updateChain, deleteChain } =
  await import("../controllers/chainController.js");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

describe("getChains - pagination (#560)", () => {
  beforeEach(() => mockGetAll.mockResolvedValue([{ id: 1 }]));
  afterEach(() => jest.clearAllMocks());

  test("default page=1 limit=10 produces offset=0", async () => {
    await getChains({ query: { page: 1, limit: 10 } }, mockRes());
    expect(mockGetAll).toHaveBeenCalledWith(10, 0);
  });

  test("page=3 limit=20 produces offset=40", async () => {
    const res = mockRes();
    await getChains({ query: { page: 3, limit: 20 } }, res);
    expect(mockGetAll).toHaveBeenCalledWith(20, 40);
  });

  test("max limit=100 is accepted", async () => {
    await getChains({ query: { page: 1, limit: 100 } }, mockRes());
    expect(mockGetAll).toHaveBeenCalledWith(100, 0);
  });

  test("max page=10000 produces offset=99990", async () => {
    await getChains({ query: { page: 10000, limit: 10 } }, mockRes());
    expect(mockGetAll).toHaveBeenCalledWith(10, 99990);
  });

  test("returns 500 when model throws", async () => {
    mockGetAll.mockRejectedValue(new Error("db error"));
    const res = mockRes();
    await getChains({ query: { page: 1, limit: 10 } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("createChain - mass assignment (#562)", () => {
  afterEach(() => jest.clearAllMocks());

  test("passes whitelisted body to Chain.create and returns 201", async () => {
    const body = { name: "Stellar", chainId: "xlm", symbol: "XLM", is_active: true };
    mockCreate.mockResolvedValue({ id: 1, ...body });
    const res = mockRes();
    await createChain({ body }, res);
    expect(mockCreate).toHaveBeenCalledWith(body);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("controller does not inject extra fields beyond req.body", async () => {
    const body = { name: "Eth", chainId: "eth" };
    mockCreate.mockResolvedValue({ id: 2, ...body });
    const res = mockRes();
    await createChain({ body }, res);
    expect(mockCreate).not.toHaveBeenCalledWith(expect.objectContaining({ admin: true }));
  });

  test("returns 500 on model error", async () => {
    mockCreate.mockRejectedValue(new Error("fail"));
    const res = mockRes();
    await createChain({ body: { name: "X", chainId: "x" } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("updateChain - mass assignment (#562)", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 404 when chain not found", async () => {
    mockFindById.mockResolvedValue(null);
    const res = mockRes();
    await updateChain({ params: { id: "99" }, body: { name: "X" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Chain not found" });
  });

  test("passes only validated body to Chain.update", async () => {
    mockFindById.mockResolvedValue({ id: 1 });
    mockUpdate.mockResolvedValue({ id: 1, name: "New" });
    const body = { name: "New", is_active: false };
    const res = mockRes();
    await updateChain({ params: { id: "1" }, body }, res);
    expect(mockUpdate).toHaveBeenCalledWith("1", body);
  });
});

describe("getChainById", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 404 for unknown id", async () => {
    mockFindById.mockResolvedValue(null);
    const res = mockRes();
    await getChainById({ params: { id: "999" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("returns chain when found", async () => {
    const chain = { id: 1, name: "Stellar" };
    mockFindById.mockResolvedValue(chain);
    const res = mockRes();
    await getChainById({ params: { id: "1" } }, res);
    expect(res.json).toHaveBeenCalledWith(chain);
  });
});

describe("deleteChain", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 404 when chain not found", async () => {
    mockFindById.mockResolvedValue(null);
    const res = mockRes();
    await deleteChain({ params: { id: "99" } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("deletes and returns success message", async () => {
    mockFindById.mockResolvedValue({ id: 1 });
    mockDelete.mockResolvedValue(1);
    const res = mockRes();
    await deleteChain({ params: { id: "1" } }, res);
    expect(res.json).toHaveBeenCalledWith({ message: "Chain deleted successfully" });
  });
});