import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.unstable_mockModule("../config/database.js", () => ({ default: jest.fn() }));
jest.unstable_mockModule("../config/redis.js", () => ({ default: {} }));
jest.unstable_mockModule("../services/WebhookService.js", () => ({
  default: { dispatch: jest.fn() },
  WEBHOOK_EVENTS: { WALLET_CREDITED: "wallet.credited" },
}));
jest.unstable_mockModule("../services/SocketService.js", () => ({
  default: { emitBalanceUpdate: jest.fn() },
}));

const { StellarStreamService } = await import("../services/StellarStreamService.js");

const ADDRESS = "GRECIPIENT";
const payment = {
  id: "op-1",
  paging_token: "cursor-1",
  type: "payment",
  to: ADDRESS,
  from: "GSENDER",
  amount: "5",
  asset_type: "native",
  transaction_hash: "hash-1",
};

describe("StellarStreamService duplicate events", () => {
  let service;
  let redisClient;
  let webhookService;

  beforeEach(() => {
    redisClient = { get: jest.fn(), set: jest.fn().mockResolvedValue("OK"), scan: jest.fn() };
    webhookService = { dispatch: jest.fn().mockResolvedValue() };
    service = new StellarStreamService({
      server: {},
      database: jest.fn(),
      redisClient,
      webhookService,
      log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });
    jest.spyOn(service, "invalidateTransactionHistory").mockResolvedValue();
  });

  it("persists the cursor on replay without crediting or notifying twice", async () => {
    // recordIncomingPayment returns null when the payment fingerprint already exists.
    jest.spyOn(service, "recordIncomingPayment")
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce(null);
    const stream = { address: ADDRESS, userId: 7 };

    await service.handlePayment(stream, payment);
    await service.handlePayment(stream, payment);

    expect(redisClient.set).toHaveBeenCalledTimes(2);
    expect(redisClient.set).toHaveBeenLastCalledWith(service.cursorKey(ADDRESS), "cursor-1");
    expect(webhookService.dispatch).toHaveBeenCalledTimes(1);
  });

  it("does not advance the cursor when processing fails", async () => {
    jest.spyOn(service, "recordIncomingPayment").mockRejectedValue(new Error("db down"));

    await service.handlePayment({ address: ADDRESS, userId: 7 }, payment);

    expect(redisClient.set).not.toHaveBeenCalled();
    expect(webhookService.dispatch).not.toHaveBeenCalled();
  });

  it("resumes from the persisted cursor after a restart", async () => {
    redisClient.get.mockResolvedValue("cursor-1");
    await expect(service.getCursor(ADDRESS)).resolves.toBe("cursor-1");
    expect(redisClient.get).toHaveBeenCalledWith(service.cursorKey(ADDRESS));
  });
});
