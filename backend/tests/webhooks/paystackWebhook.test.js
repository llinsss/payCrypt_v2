import { jest } from "@jest/globals";
import crypto from "crypto";

const PAYSTACK_SECRET = "sk_test_paystack_secret";
// PaystackService reads the secret from the environment in its constructor, so
// this must be set before the module is (dynamically) imported below.
process.env.PAYSTACK_SECRET_KEY = PAYSTACK_SECRET;

let handlePaystackWebhook;
let OffRampService;
let Sentry;

beforeAll(async () => {
  jest.unstable_mockModule("../../services/OffRampService.js", () => ({
    default: { handleWebhook: jest.fn().mockResolvedValue(undefined) },
  }));
  jest.unstable_mockModule("@sentry/node", () => ({
    captureMessage: jest.fn(),
    captureException: jest.fn(),
  }));

  ({ handlePaystackWebhook } = await import(
    "../../controllers/webhooks/paystackWebhook.js"
  ));
  OffRampService = (await import("../../services/OffRampService.js")).default;
  Sentry = await import("@sentry/node");
});

function sign(rawBody) {
  return crypto
    .createHmac("sha512", PAYSTACK_SECRET)
    .update(rawBody)
    .digest("hex");
}

function mockReq(payload, { signature } = {}) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return {
    headers: {
      "x-paystack-signature": signature ?? sign(rawBody),
      "x-forwarded-for": "203.0.113.7",
    },
    ip: "203.0.113.7",
    socket: { remoteAddress: "203.0.113.7" },
    rawBody,
    body: payload,
  };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe("handlePaystackWebhook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("processes a transfer.success event when the signature is valid", async () => {
    const payload = {
      event: "transfer.success",
      data: { reference: "ref_valid_1", amount: 15000 },
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handlePaystackWebhook(req, res);

    expect(OffRampService.handleWebhook).toHaveBeenCalledWith(
      "paystack",
      "ref_valid_1",
      "success",
      payload.data,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature with 401 and does not process the event", async () => {
    const payload = {
      event: "transfer.success",
      data: { reference: "ref_attacker", amount: 999999 },
    };
    const req = mockReq(payload, { signature: "deadbeef_not_a_real_signature" });
    const res = mockRes();

    await handlePaystackWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith("Invalid signature");
    expect(OffRampService.handleWebhook).not.toHaveBeenCalled();
  });

  it("logs verification failures to Sentry with the source IP and payload", async () => {
    const payload = { event: "transfer.success", data: { reference: "ref_x" } };
    const req = mockReq(payload, { signature: "wrong" });
    const res = mockRes();

    await handlePaystackWebhook(req, res);

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = Sentry.captureMessage.mock.calls[0];
    expect(message).toMatch(/signature verification failed/i);
    expect(context.level).toBe("warning");
    expect(context.extra.ip).toBe("203.0.113.7");
    expect(context.extra.payload).toEqual(payload);
  });

  it("rejects a request that is missing the signature header", async () => {
    const payload = { event: "transfer.success", data: { reference: "ref_y" } };
    const req = mockReq(payload, { signature: undefined });
    delete req.headers["x-paystack-signature"];
    const res = mockRes();

    await handlePaystackWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(OffRampService.handleWebhook).not.toHaveBeenCalled();
  });
});
