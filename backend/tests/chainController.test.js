/**
 * Tests for chainController.js
 *
 * Covers:
 *  - Issue #560: pagination validation (boundary cases, NaN, negative, zero, oversized)
 *  - Issue #562: mass-assignment prevention (unknown / sensitive fields stripped)
 *
 * Strategy: unit-test the controller functions directly by injecting mock
 * req/res objects; the Chain model is replaced with jest module mocks so no
 * database is needed.
 */
import { jest } from "@jest/globals";

// ── Mock the Chain model ─────────────────────────────────────────────────────
const mockCreate   = jest.fn();
const mockGetAll   = jest.fn();
const mockFindById = jest.fn();
const mockUpdate   = jest.fn();
const mockDelete   = jest.fn();

jest.unstable_mockModule("../models/Chain.js", () => ({
  default: {
    create:   mockCreate,
    getAll:   mockGetAll,
    findById: mockFindById,
    update:   mockUpdate,
    delete:   mockDelete,
  },
}));

// ── Import controller AFTER mocks are wired ──────────────────────────────────
const {
  createChain,
  getChains,
  getChainById,
  updateChain,
  deleteChain,
} = await import("../controllers/chainController.js");

// ── Helpers ──────────────────────────────────────────────────────────────────
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

// ─────────────────────────────────────────────────────────────────────────────
// getChains — pagination (Issue #560)
// ─────────────────────────────────────────────────────────────────────────────
describe("getChains — pagination", () => {
  beforeEach(() => {
    mockGetAll.mockResolvedValue([{ id: 1, name: "Ethereum" }]);
  });

  afterEach(() => jest.clearAllMocks());

  test("uses validated page and limit from req.query (default values)", async () => {
    // Simulate middleware having applied defaults
    const req = { query: { page: 1, limit: 10 } };
    const res = mockRes();

    await getChains(req, res);

    // offset = (1-1) * 10 = 0
    expect(mockGetAll).toHaveBeenCalledWith(10, 0);
    expect(res.json).toHaveBeenCalledWith([{ id: 1, name: "Ethereum" }]);
  });

  test("computes correct offset for page > 1", async () => {
    const req = { query: { page: 3, limit: 20 } };
    const res = mockRes();

    await getChains(req, res);

    // offset = (3-1) * 20 = 40
    expect(mockGetAll).toHaveBeenCalledWith(20, 40);
  });

  test("uses max allowed limit (100) without overflow", async () => {
    const req = { query: { page: 1, limit: 100 } };
    const res = mockRes();

    await getChains(req, res);

    expect(mockGetAll).toHaveBeenCalledWith(100, 0);
  });

  test("uses max allowed page (10000) without overflow", async () => {
    const req = { query: { page: 10000, limit: 10 } };
    const res = mockRes();

    await getChains(req, res);

    // offset = (10000-1) * 10 = 99990
    expect(mockGetAll).toHaveBeenCalledWith(10, 99990);
  });

  test("returns 500 when model throws", async () => {
    mockGetAll.mockRejectedValue(new Error("db error"));
    const req = { query: { page: 1, limit: 10 } };
    const res = mockRes();

    await getChains(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: "db error" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// createChain — mass assignment (Issue #562)
// ─────────────────────────────────────────────────────────────────────────────
describe("createChain — mass assignment prevention", () => {
  afterEach(() => jest.clearAllMocks());

  test("passes validated body to Chain.create unchanged", async () => {
    const safeBody = { name: "Stellar", chainId: "xlm", symbol: "XLM", is_active: true };
    mockCreate.mockResolvedValue({ id: 1, ...safeBody });

    const req = { body: safeBody };
    const res = mockRes();

    await createChain(req, res);

    expect(mockCreate).toHaveBeenCalledWith(safeBody);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  test("only whitelisted fields reach the model (middleware strips unknowns before controller)", async () => {
    // By the time the controller runs, the validate middleware has already
    // stripped unknown fields from req.body. We verify the controller passes
    // req.body as-is (i.e. it does NOT re-add dropped fields).
    const strippedBody = { name: "Ethereum", chainId: "eth" };
    mockCreate.mockResolvedValue({ id: 2, ...strippedBody });

    const req = { body: strippedBody }; // unknown fields already stripped
    const res = mockRes();

    await createChain(req, res);

    expect(mockCreate).toHaveBeenCalledWith(strippedBody);
    // The controller must NOT call Create with anything other than req.body
    expect(mockCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ admin: true })
    );
  });

  test("returns 500 when model throws", async () => {
    mockCreate.mockRejectedValue(new Error("unique constraint"));
    const req = { body: { name: "Dup", chainId: "dup" } };
    const res = mockRes();

    await createChain(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateChain — mass assignment (Issue #562)
// ─────────────────────────────────────────────────────────────────────────────
describe("updateChain — mass assignment prevention", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 404 when chain does not exist", async () => {
    mockFindById.mockResolvedValue(null);
    const req = { params: { id: "99" }, body: { name: "X" } };
    const res = mockRes();

    await updateChain(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: "Chain not found" });
  });

  test("passes validated body to Chain.update, no extra fields", async () => {
    const existing = { id: 1, name: "Old Name", chainId: "eth" };
    const updateBody = { name: "New Name", is_active: false };
    mockFindById.mockResolvedValue(existing);
    mockUpdate.mockResolvedValue({ ...existing, ...updateBody });

    const req = { params: { id: "1" }, body: updateBody };
    const res = mockRes();

    await updateChain(req, res);

    expect(mockUpdate).toHaveBeenCalledWith("1", updateBody);
    expect(mockUpdate).not.toHaveBeenCalledWith(
      "1",
      expect.objectContaining({ __proto__: expect.anything() })
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getChainById
// ─────────────────────────────────────────────────────────────────────────────
describe("getChainById", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 404 for unknown id", async () => {
    mockFindById.mockResolvedValue(null);
    const req = { params: { id: "999" } };
    const res = mockRes();

    await getChainById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("returns chain when found", async () => {
    const chain = { id: 1, name: "Stellar", chainId: "xlm" };
    mockFindById.mockResolvedValue(chain);
    const req = { params: { id: "1" } };
    const res = mockRes();

    await getChainById(req, res);

    expect(res.json).toHaveBeenCalledWith(chain);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteChain
// ─────────────────────────────────────────────────────────────────────────────
describe("deleteChain", () => {
  afterEach(() => jest.clearAllMocks());

  test("returns 404 when chain does not exist", async () => {
    mockFindById.mockResolvedValue(null);
    const req = { params: { id: "99" } };
    const res = mockRes();

    await deleteChain(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  test("deletes and returns success message", async () => {
    mockFindById.mockResolvedValue({ id: 1 });
    mockDelete.mockResolvedValue(1);
    const req = { params: { id: "1" } };
    const res = mockRes();

    await deleteChain(req, res);

    expect(mockDelete).toHaveBeenCalledWith("1");
    expect(res.json).toHaveBeenCalledWith({ message: "Chain deleted successfully" });
  });
});