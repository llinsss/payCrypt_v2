import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, apiClient: { get: vi.fn(), post: vi.fn() } };
});

import { apiClient, ApiError } from "./api";
import { ApiContractError } from "./apiContracts";
import {
  billsApi,
  parseBillPaymentResponse,
  submitBillPayment,
  type BillPaymentState,
} from "./billsApi";

const request = { category: "airtime" as const, provider: "mtn", phone: "08012345678", amount: 500 };

const payResponse = (status: string) => ({
  status: "success",
  data: {
    success: true,
    transactionId: 42,
    message: "Bill payment of ₦500 processed successfully",
    data: { id: 42, status, metadata: { reference: "BILL-123-abc" } },
  },
});

const noSleep = () => Promise.resolve();

describe("billsApi", () => {
  beforeEach(() => vi.mocked(apiClient.post).mockReset());

  it("posts the payment to the authenticated bills endpoint", async () => {
    vi.mocked(apiClient.post).mockResolvedValue(payResponse("completed"));

    const result = await billsApi.pay(request);

    expect(apiClient.post).toHaveBeenCalledWith("/bills/pay", request);
    expect(result).toEqual({
      status: "completed",
      message: "Bill payment of ₦500 processed successfully",
      transactionId: "42",
      reference: "BILL-123-abc",
    });
  });

  it("loads providers for a category from the API", async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ status: "success", data: [{ id: "mtn", name: "MTN" }] });

    await expect(billsApi.getProviders("airtime")).resolves.toEqual([{ id: "mtn", name: "MTN" }]);
    expect(apiClient.get).toHaveBeenCalledWith("/bills/providers/airtime");
  });

  it("treats non-final transaction statuses as pending", () => {
    expect(parseBillPaymentResponse(payResponse("processing")).status).toBe("pending");
    expect(parseBillPaymentResponse(payResponse("failed")).status).toBe("failed");
  });

  it("rejects responses that are not a successful payment envelope", () => {
    expect(() => parseBillPaymentResponse({ status: "error", message: "nope" })).toThrow(ApiContractError);
    expect(() => parseBillPaymentResponse({ status: "success", data: { data: {} } })).toThrow(ApiContractError);
  });
});

describe("submitBillPayment", () => {
  it("reports pending first, then the final state from the backend", async () => {
    const updates: BillPaymentState[] = [];
    const api = { pay: vi.fn().mockResolvedValue(parseBillPaymentResponse(payResponse("completed"))), getStatus: vi.fn() };

    const result = await submitBillPayment(request, { api, onUpdate: (s) => updates.push(s), sleep: noSleep });

    expect(updates.map((s) => s.status)).toEqual(["pending", "completed"]);
    expect(result).toMatchObject({ status: "completed", transactionId: "42", reference: "BILL-123-abc" });
    expect(api.getStatus).not.toHaveBeenCalled();
  });

  it("preserves the provider/API error message on failure", async () => {
    const api = {
      pay: vi.fn().mockRejectedValue(new ApiError(402, "Insufficient wallet balance")),
      getStatus: vi.fn(),
    };

    const result = await submitBillPayment(request, { api, sleep: noSleep });

    expect(result).toEqual({ status: "failed", message: "Insufficient wallet balance" });
  });

  it("tracks a pending payment until it reaches a final status", async () => {
    const updates: BillPaymentState[] = [];
    const api = {
      pay: vi.fn().mockResolvedValue(parseBillPaymentResponse(payResponse("processing"))),
      getStatus: vi
        .fn()
        .mockResolvedValueOnce("pending")
        .mockRejectedValueOnce(new Error("network blip"))
        .mockResolvedValueOnce("failed"),
    };

    const result = await submitBillPayment(request, { api, onUpdate: (s) => updates.push(s), sleep: noSleep });

    expect(api.getStatus).toHaveBeenCalledTimes(3);
    expect(api.getStatus).toHaveBeenCalledWith("42");
    expect(updates.map((s) => s.status)).toEqual(["pending", "pending", "failed"]);
    expect(result.status).toBe("failed");
  });

  it("stays pending with its reference when tracking times out", async () => {
    const api = {
      pay: vi.fn().mockResolvedValue(parseBillPaymentResponse(payResponse("processing"))),
      getStatus: vi.fn().mockResolvedValue("pending"),
    };

    const result = await submitBillPayment(request, { api, maxPolls: 2, sleep: noSleep });

    expect(api.getStatus).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "pending", reference: "BILL-123-abc" });
  });

  it("does not use randomness to decide the outcome", async () => {
    const random = vi.spyOn(Math, "random");
    const api = { pay: vi.fn().mockResolvedValue(parseBillPaymentResponse(payResponse("completed"))), getStatus: vi.fn() };

    await submitBillPayment(request, { api, sleep: noSleep });

    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
