import { jest } from "@jest/globals";
import crypto from "crypto";

const MONNIFY_SECRET = "test_monnify_secret_key";
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

  it("completes the withdrawal on a verified DISBURSEMENT_SUCCESSFUL event", async () => {
    const payload = {
      eventType: "DISBURSEMENT_SUCCESSFUL",
      eventData: { reference: "wd_ref_valid_1", amount: 15000 },
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleMonnifyWebhook(req, res);

    expect(OffRampService.handleWebhook).toHaveBeenCalledWith(
      "monnify",
      "wd_ref_valid_1",
      "success",
      payload.eventData,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature with 400 and does not process the event", async () => {
    const payload = {
      eventType: "DISBURSEMENT_SUCCESSFUL",
      eventData: { reference: "wd_ref_attacker", amount: 999999 },
    };
    const req = mockReq(payload, { signature: "deadbeef_not_a_real_signature" });
    const res = mockRes();

    await handleMonnifyWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith("Invalid signature");
    expect(OffRampService.handleWebhook).not.toHaveBeenCalled();
  });

  it("rejects a tampered payload whose bytes no longer match the signature", async () => {
    const original = { eventType: "DISBURSEMENT_SUCCESSFUL", eventData: { reference: "wd_ref_1", amount: 100 } };
    const originalRawBody = Buffer.from(JSON.stringify(original));
    const tampered = { ...original, eventData: { reference: "wd_ref_1", amount: 999999999 } };

    const req = {
      headers: { "monnify-signature": sign(originalRawBody) },
      ip: "203.0.113.9",
      socket: { remoteAddress: "203.0.113.9" },
      rawBody: Buffer.from(JSON.stringify(tampered)),
      body: tampered,
    };
    const res = mockRes();

    await handleMonnifyWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(OffRampService.handleWebhook).not.toHaveBeenCalled();
  });

  it("logs verification failures to Sentry with the source IP and payload", async () => {
    const payload = { eventType: "DISBURSEMENT_SUCCESSFUL", eventData: { reference: "wd_ref_x" } };
    const req = mockReq(payload, { signature: "wrong" });
    const res = mockRes();

    await handleMonnifyWebhook(req, res);

    expect(Sentry.captureMessage).toHaveBeenCalledTimes(1);
    const [message, context] = Sentry.captureMessage.mock.calls[0];
    expect(message).toMatch(/signature verification failed/i);
    expect(context.level).toBe("warning");
    expect(context.extra.ip).toBe("203.0.113.9");
    expect(context.extra.payload).toEqual(payload);
  });

  it("does not complete the withdrawal for a verified but non-successful event", async () => {
    const payload = {
      eventType: "DISBURSEMENT_FAILED",
      eventData: { reference: "wd_ref_failed", amount: 5000 },
    };
    const req = mockReq(payload);
    const res = mockRes();

    await handleMonnifyWebhook(req, res);

    expect(OffRampService.handleWebhook).toHaveBeenCalledWith(
      "monnify",
      "wd_ref_failed",
      "failed",
      payload.eventData,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
