import { jest } from "@jest/globals";
import crypto from "crypto";

const MONNIFY_SECRET = "sk_test_monnify_secret";
// MonnifyService reads the secret from the environment in its constructor, so
// this must be set before the module is (dynamically) imported below.
process.env.MONNIFY_SECRET_KEY = MONNIFY_SECRET;

let handleMonnifyWebhook;
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

  ({ handleMonnifyWebhook } = await import(
    "../../controllers/webhooks/monnifyWebhook.js"
  ));
  OffRampService = (await import("../../services/OffRampService.js")).default;
  Sentry = await import("@sentry/node");
});

function sign(rawBody) {
  return crypto
    .createHmac("sha512", MONNIFY_SECRET)
    .update(rawBody)
    .digest("hex");
}

function mockReq(payload, { signature } = {}) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  return {
    headers: {
      "monnify-signature": signature ?? sign(rawBody),
      "x-forwarded-for": "203.0.113.9",
    },
    ip: "203.0.113.9",
    socket: { remoteAddress: "203.0.113.9" },
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

describe("handleMonnifyWebhook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks the withdrawal completed on a verified SUCCESSFUL_DISBURSEMENT event", async () => {
    const payload = {
      eventType: "SUCCESSFUL_DISBURSEMENT",
      eventData: { reference: "WTH-MOC-1", amount: 15000, status: "SUCCESSFUL" },
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleMonnifyWebhook(req, res);

    expect(OffRampService.handleWebhook).toHaveBeenCalledWith(
      "monnify",
      "WTH-MOC-1",
      "success",
      payload.eventData,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("reports a failed disbursement without marking the withdrawal completed", async () => {
    const payload = {
      eventType: "FAILED_DISBURSEMENT",
      eventData: { reference: "WTH-MOC-2", status: "FAILED" },
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleMonnifyWebhook(req, res);

    expect(OffRampService.handleWebhook).toHaveBeenCalledWith(
      "monnify",
      "WTH-MOC-2",
      "failed",
      payload.eventData,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("rejects an invalid signature with 400, logs a warning, and never processes the event", async () => {
    const payload = {
      eventType: "SUCCESSFUL_DISBURSEMENT",
      eventData: { reference: "WTH-MOC-attacker", amount: 999999, status: "SUCCESSFUL" },
    };
    const req = mockReq(payload, { signature: "deadbeef_not_a_real_signature" });
    const res = mockRes();

    await handleMonnifyWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith("Invalid signature");
    expect(OffRampService.handleWebhook).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = Sentry.captureMessage.mock.calls[0];
    expect(message).toMatch(/signature verification failed/i);
    expect(context.level).toBe("warning");
  });

  it("rejects a tampered payload whose bytes no longer match the signature", async () => {
    const originalPayload = {
      eventType: "SUCCESSFUL_DISBURSEMENT",
      eventData: { reference: "WTH-MOC-3", amount: 1000, status: "SUCCESSFUL" },
    };
    const signature = sign(Buffer.from(JSON.stringify(originalPayload)));

    // Attacker mutates the amount after the signature was computed.
    const tamperedPayload = {
      ...originalPayload,
      eventData: { ...originalPayload.eventData, amount: 9999999 },
    };
    const req = mockReq(tamperedPayload, { signature });
    const res = mockRes();

    await handleMonnifyWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(OffRampService.handleWebhook).not.toHaveBeenCalled();
  });

  it("rejects a request that is missing the signature header", async () => {
    const payload = { eventType: "SUCCESSFUL_DISBURSEMENT", eventData: { reference: "ref_y" } };
    const req = mockReq(payload, { signature: undefined });
    delete req.headers["monnify-signature"];
    const res = mockRes();

    await handleMonnifyWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(OffRampService.handleWebhook).not.toHaveBeenCalled();
  });
});
