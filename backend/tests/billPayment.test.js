import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// Minimal in-memory Knex stand-in: enough query surface for BillPaymentService,
// plus a counter of open transactions so tests can assert none is held open
// while the provider is called.
const tables = { balances: [], transactions: [] };
let openTransactions = 0;
let nextId = 1;

function query(name) {
  const filters = [];
  const matched = () => tables[name].filter((row) => filters.every((match) => match(row)));
  const q = {
    where(column, op, value) {
      filters.push(
        typeof column === "object"
          ? (row) => Object.entries(column).every(([key, expected]) => row[key] === expected)
          : (row) => row[column] < value,
      );
      return q;
    },
    forUpdate: () => q,
    first: async () => matched().map((row) => ({ ...row }))[0],
    select: async () => matched().map((row) => ({ ...row })),
    decrement: async (column, by) => matched().forEach((row) => (row[column] -= Number(by))),
    increment: async (column, by) => matched().forEach((row) => (row[column] += Number(by))),
    insert: (row) => ({
      returning: async () => {
        const created = { id: nextId++, created_at: new Date(), ...row };
        tables[name].push(created);
        return [{ ...created }];
      },
    }),
    update: (patch) => ({
      returning: async () => matched().map((row) => ({ ...Object.assign(row, patch) })),
    }),
  };
  return q;
}

const db = Object.assign((name) => query(name), {
  transaction: async (callback) => {
    openTransactions++;
    try {
      return await callback(Object.assign((name) => query(name), { fn: { now: () => new Date() } }));
    } finally {
      openTransactions--;
    }
  },
});

jest.unstable_mockModule("../config/database.js", () => ({ default: db }));
jest.unstable_mockModule("../models/User.js", () => ({
  default: { findById: jest.fn(async (id) => ({ id })) },
}));

const { BillPaymentService, BILL_PAYMENT_DECLINED, mapVtpassStatus } = await import(
  "../services/BillPaymentService.js"
);

const USER_ID = 1;
const request = { userId: USER_ID, category: "airtime", provider: "mtn", phone: "08012345678", amount: 100 };
const balance = () => tables.balances[0].ngn_balance;
const payment = () => tables.transactions[0];

describe("BillPaymentService", () => {
  let provider;
  let service;

  beforeEach(() => {
    tables.balances = [{ user_id: USER_ID, ngn_balance: 500 }];
    tables.transactions = [];
    openTransactions = 0;
    provider = { pay: jest.fn(), requery: jest.fn() };
    service = new BillPaymentService(provider);
  });

  it("commits a pending intent before calling the provider, outside any transaction", async () => {
    provider.pay.mockImplementation(async ({ reference }) => {
      expect(openTransactions).toBe(0);
      expect(payment()).toMatchObject({ status: "pending", reference });
      expect(balance()).toBe(400);
      return "completed";
    });

    const result = await service.processBillPayment(request);

    expect(result).toMatchObject({ success: true, status: "completed" });
    expect(payment().status).toBe("completed");
    expect(balance()).toBe(400);
  });

  it("refunds the reservation when the provider declines", async () => {
    provider.pay.mockResolvedValue("failed");

    await expect(service.processBillPayment(request)).rejects.toThrow(BILL_PAYMENT_DECLINED);
    expect(payment().status).toBe("failed");
    expect(balance()).toBe(500);
  });

  it("leaves the payment pending with funds reserved when the provider times out", async () => {
    provider.pay.mockRejectedValue(Object.assign(new Error("timeout"), { code: "ECONNABORTED" }));

    const result = await service.processBillPayment(request);

    expect(result).toMatchObject({ success: true, status: "pending" });
    expect(payment().status).toBe("pending");
    expect(balance()).toBe(400);
  });

  it("rejects insufficient balances without calling the provider", async () => {
    await expect(service.processBillPayment({ ...request, amount: 1000 })).rejects.toThrow(
      "Insufficient wallet balance",
    );
    expect(provider.pay).not.toHaveBeenCalled();
    expect(tables.transactions).toHaveLength(0);
  });

  it("finalizes at most once, so repeated failures refund once", async () => {
    provider.pay.mockRejectedValue(new Error("socket hang up"));
    await service.processBillPayment(request);
    const { reference } = payment();

    await service.finalizePayment(reference, "failed");
    await service.finalizePayment(reference, "failed");
    await service.finalizePayment(reference, "completed");

    expect(payment().status).toBe("failed");
    expect(balance()).toBe(500);
  });

  describe("reconcilePendingPayments (timeout / crash recovery)", () => {
    const seedPending = (reference, ageMs) => {
      tables.balances[0].ngn_balance -= 100;
      tables.transactions.push({
        id: nextId++,
        user_id: USER_ID,
        type: "bill_payment",
        status: "pending",
        amount: 100,
        reference,
        created_at: new Date(Date.now() - ageMs),
      });
    };

    it("finalizes stale pending payments from the provider's requery result", async () => {
      seedPending("BILL-done", 10 * 60 * 1000);
      seedPending("BILL-declined", 10 * 60 * 1000);
      seedPending("BILL-unknown", 10 * 60 * 1000);
      seedPending("BILL-fresh", 0);
      provider.requery.mockImplementation(async (reference) =>
        ({ "BILL-done": "completed", "BILL-declined": "failed" })[reference] ?? Promise.reject(new Error("503")),
      );

      const results = await service.reconcilePendingPayments({ olderThanMs: 5 * 60 * 1000 });

      expect(results).toEqual({ total: 3, completed: 1, failed: 1, pending: 1 });
      expect(provider.requery).not.toHaveBeenCalledWith("BILL-fresh");
      const status = Object.fromEntries(tables.transactions.map((t) => [t.reference, t.status]));
      expect(status).toEqual({
        "BILL-done": "completed",
        "BILL-declined": "failed",
        "BILL-unknown": "pending",
        "BILL-fresh": "pending",
      });
      // Only the declined payment is refunded.
      expect(balance()).toBe(500 - 400 + 100);
    });
  });
});

describe("mapVtpassStatus", () => {
  it.each([
    [{ code: "000", content: { transactions: { status: "delivered" } } }, "completed"],
    [{ code: "000", content: { transactions: { status: "pending" } } }, "pending"],
    [{ code: "099" }, "pending"],
    [{ code: "016" }, "failed"],
    [{ code: "018" }, "failed"],
    [{ code: "000", content: { transactions: { status: "reversed" } } }, "failed"],
    [undefined, "pending"],
  ])("maps %j to %s", (body, expected) => {
    expect(mapVtpassStatus(body)).toBe(expected);
  });
});
