import { jest } from "@jest/globals";

// ---------------------------------------------------------------------------
// Module mocks must be registered before the service is imported.
// ---------------------------------------------------------------------------

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();

jest.unstable_mockModule("../config/redis.js", () => ({
  default: { get: mockRedisGet, set: mockRedisSet },
}));

jest.unstable_mockModule("../utils/logger.js", () => ({
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockAccountFindByAddress = jest.fn();
const mockAccountUpdateBalance = jest.fn();
const mockAccountGetActive = jest.fn();

jest.unstable_mockModule("../models/StellarAccount.js", () => ({
  default: {
    findByAddress: mockAccountFindByAddress,
    updateBalance: mockAccountUpdateBalance,
    getActive: mockAccountGetActive,
  },
}));

const mockStellarTxFindByHash = jest.fn();
const mockStellarTxCreate = jest.fn();

jest.unstable_mockModule("../models/StellarTransaction.js", () => ({
  default: {
    findByHash: mockStellarTxFindByHash,
    create: mockStellarTxCreate,
  },
}));

const mockTransactionCreate = jest.fn();

jest.unstable_mockModule("../models/Transaction.js", () => ({
  default: { create: mockTransactionCreate },
}));

const mockDispatch = jest.fn();

jest.unstable_mockModule("../services/WebhookService.js", () => ({
  default: { dispatch: mockDispatch },
  WEBHOOK_EVENTS: { WALLET_CREDITED: "wallet.credited" },
}));

const mockStream = jest.fn();

jest.unstable_mockModule("@stellar/stellar-sdk", () => ({
  Horizon: {
    Server: jest.fn().mockImplementation(() => ({
      payments: () => ({
        forAccount: () => ({
          cursor: () => ({ stream: mockStream }),
        }),
      }),
    })),
  },
}));

const { default: StellarStreamService } = await import(
  "../services/StellarStreamService.js"
);

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRS";

const buildPayment = (overrides = {}) => ({
  id: "op-1",
  type: "payment",
  paging_token: "12345",
  transaction_hash: "hash-1",
  from: "GSENDER",
  to: ADDRESS,
  amount: "25.0000000",
  asset_type: "native",
  created_at: "2026-07-26T10:00:00Z",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  StellarStreamService.streams.clear();
  StellarStreamService.timers.clear();
  StellarStreamService.started = false;

  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue("OK");
  mockAccountFindByAddress.mockResolvedValue({
    stellar_address: ADDRESS,
    user_id: 7,
    xlm_balance: "10.0000000",
    balances: [],
  });
  mockStellarTxFindByHash.mockResolvedValue(null);
  mockStellarTxCreate.mockResolvedValue({ id: 1 });
  mockTransactionCreate.mockResolvedValue({ id: 99 });
  mockDispatch.mockResolvedValue(undefined);
  mockAccountUpdateBalance.mockResolvedValue({});
});

describe("StellarStreamService — cursor persistence", () => {
  it("defaults to 'now' when no cursor is stored", async () => {
    mockRedisGet.mockResolvedValue(null);
    await expect(StellarStreamService.getCursor(ADDRESS)).resolves.toBe("now");
  });

  it("resumes from the persisted cursor after a restart", async () => {
    mockRedisGet.mockResolvedValue("98765");
    await expect(StellarStreamService.getCursor(ADDRESS)).resolves.toBe("98765");
  });

  it("falls back to 'now' when Redis is unavailable", async () => {
    mockRedisGet.mockRejectedValue(new Error("redis down"));
    await expect(StellarStreamService.getCursor(ADDRESS)).resolves.toBe("now");
  });

  it("advances the cursor when a payment arrives", async () => {
    await StellarStreamService.handlePayment(ADDRESS, buildPayment());
    expect(mockRedisSet).toHaveBeenCalledWith(
      `stellar:stream:cursor:${ADDRESS}`,
      "12345"
    );
  });
});

describe("StellarStreamService — incoming payments", () => {
  it("records the transaction, credits balance and fires a webhook", async () => {
    await StellarStreamService.handlePayment(ADDRESS, buildPayment());

    expect(mockStellarTxCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction_hash: "hash-1",
        stellar_address: ADDRESS,
        is_incoming: true,
        asset_code: "XLM",
        status: "success",
      })
    );

    expect(mockAccountUpdateBalance).toHaveBeenCalledWith(ADDRESS, 35, []);

    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 7, type: "deposit", status: "completed" })
    );

    expect(mockDispatch).toHaveBeenCalledWith(
      "wallet.credited",
      expect.objectContaining({ transaction_hash: "hash-1", amount: "25.0000000" }),
      7
    );
  });

  it("credits a create_account operation using starting_balance", async () => {
    await StellarStreamService.handlePayment(
      ADDRESS,
      buildPayment({
        id: "op-2",
        type: "create_account",
        account: ADDRESS,
        funder: "GFUNDER",
        starting_balance: "5.0000000",
        amount: undefined,
        to: undefined,
      })
    );

    expect(mockStellarTxCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "5.0000000", source_account: "GFUNDER" })
    );
  });

  it("ignores outgoing payments", async () => {
    await StellarStreamService.handlePayment(
      ADDRESS,
      buildPayment({ to: "GSOMEONEELSE", from: ADDRESS })
    );
    expect(mockStellarTxCreate).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("ignores non-payment operation types", async () => {
    await StellarStreamService.handlePayment(
      ADDRESS,
      buildPayment({ type: "manage_offer" })
    );
    expect(mockStellarTxCreate).not.toHaveBeenCalled();
  });

  it("does not double-credit a replayed payment", async () => {
    // Redis SET NX returns null when the key already exists.
    mockRedisSet.mockImplementation((key) =>
      key.startsWith("stellar:stream:processed:")
        ? Promise.resolve(null)
        : Promise.resolve("OK")
    );

    await StellarStreamService.handlePayment(ADDRESS, buildPayment());

    expect(mockStellarTxCreate).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();
    expect(mockDispatch).not.toHaveBeenCalled();
  });
});

describe("StellarStreamService — reconnection", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("backs off exponentially and caps the delay", () => {
    const spy = jest.spyOn(global, "setTimeout");
    StellarStreamService.started = true;
    StellarStreamService.streams.set(ADDRESS, {
      closeFn: null,
      attempts: 0,
      reconnects: 0,
    });

    StellarStreamService.scheduleReconnect(ADDRESS);
    expect(spy.mock.calls[0][1]).toBeGreaterThanOrEqual(1000);
    expect(spy.mock.calls[0][1]).toBeLessThan(1300);

    StellarStreamService.timers.delete(ADDRESS);
    StellarStreamService.scheduleReconnect(ADDRESS);
    expect(spy.mock.calls[1][1]).toBeGreaterThanOrEqual(2000);

    // Far beyond the cap — must clamp to 60s (+ jitter).
    StellarStreamService.timers.delete(ADDRESS);
    StellarStreamService.streams.get(ADDRESS).attempts = 50;
    StellarStreamService.scheduleReconnect(ADDRESS);
    expect(spy.mock.calls[2][1]).toBeLessThanOrEqual(60250);
  });
});

describe("StellarStreamService — health status", () => {
  it("reports disabled when not started", () => {
    const status = StellarStreamService.getStatus();
    expect(status.running).toBe(false);
    expect(status.active).toBe(0);
  });

  it("reports active and degraded stream counts", () => {
    StellarStreamService.started = true;
    StellarStreamService.streams.set(ADDRESS, {
      closeFn: () => {},
      attempts: 0,
      connectedAt: "2026-07-26T10:00:00Z",
      lastEventAt: null,
      reconnects: 0,
      lastError: null,
    });
    StellarStreamService.streams.set("GOTHER", {
      closeFn: null,
      attempts: 3,
      connectedAt: null,
      lastEventAt: null,
      reconnects: 3,
      lastError: "boom",
    });

    const status = StellarStreamService.getStatus();
    expect(status.total).toBe(2);
    expect(status.active).toBe(1);
    expect(status.degraded).toBe(true);
  });
});
