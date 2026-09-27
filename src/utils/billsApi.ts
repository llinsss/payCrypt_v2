import { apiClient } from "./api";
import { ApiContractError } from "./apiContracts";

export type BillCategory = "airtime" | "data" | "electricity" | "cable_tv";

export interface BillProvider {
  id: string;
  name: string;
}

export interface BillPaymentRequest {
  category: BillCategory;
  provider: string;
  phone: string;
  amount: number;
}

export type BillPaymentStatus = "pending" | "completed" | "failed";

export interface BillPaymentState {
  status: BillPaymentStatus;
  message: string;
  transactionId?: string;
  reference?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Anything other than a final status (e.g. "pending", "processing") is still in flight.
const toStatus = (value: unknown): BillPaymentStatus =>
  value === "completed" || value === "failed" ? value : "pending";

/** Validates the POST /bills/pay success envelope and maps it to a payment state. */
export const parseBillPaymentResponse = (value: unknown): BillPaymentState => {
  const contract = "bill payment response";
  if (!isRecord(value) || value.status !== "success" || !isRecord(value.data)) {
    throw new ApiContractError(contract, "$", value);
  }
  const { data } = value;
  const transaction = data.data;
  if (!isRecord(transaction) || transaction.id === undefined || transaction.id === null) {
    throw new ApiContractError(contract, "$.data.data.id", transaction);
  }
  return {
    status: toStatus(transaction.status),
    message: typeof data.message === "string" ? data.message : "",
    transactionId: String(transaction.id),
    reference:
      isRecord(transaction.metadata) && typeof transaction.metadata.reference === "string"
        ? transaction.metadata.reference
        : undefined,
  };
};

export const billsApi = {
  async getProviders(category: BillCategory): Promise<BillProvider[]> {
    const response = await apiClient.get<unknown>(`/bills/providers/${category}`);
    if (!isRecord(response) || !Array.isArray(response.data)) {
      throw new ApiContractError("bill providers response", "$.data", response);
    }
    return response.data as BillProvider[];
  },

  async pay(request: BillPaymentRequest): Promise<BillPaymentState> {
    return parseBillPaymentResponse(await apiClient.post<unknown>("/bills/pay", request));
  },

  async getStatus(transactionId: string): Promise<BillPaymentStatus> {
    const transaction = await apiClient.get<unknown>(`/transactions/${transactionId}`);
    if (!isRecord(transaction)) {
      throw new ApiContractError("transaction response", "$", transaction);
    }
    return toStatus(transaction.status);
  },
};

// ApiError carries the backend/provider message verbatim.
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to process your payment. Please try again.";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Submits a bill payment and tracks it until it reaches a final state.
 * `onUpdate` receives every state change, starting with "pending". Provider
 * and API error messages are passed through unchanged. If the payment is
 * still pending after `maxPolls` checks, the pending state is returned.
 */
export const submitBillPayment = async (
  request: BillPaymentRequest,
  {
    onUpdate = () => {},
    api = billsApi,
    pollIntervalMs = 3000,
    maxPolls = 10,
    sleep = wait,
  }: {
    onUpdate?: (state: BillPaymentState) => void;
    api?: Pick<typeof billsApi, "pay" | "getStatus">;
    pollIntervalMs?: number;
    maxPolls?: number;
    sleep?: (ms: number) => Promise<unknown>;
  } = {}
): Promise<BillPaymentState> => {
  let state: BillPaymentState = { status: "pending", message: "Submitting your payment..." };
  const update = (next: BillPaymentState) => {
    state = next;
    onUpdate(next);
    return next;
  };
  update(state);

  try {
    update(await api.pay(request));
  } catch (error) {
    return update({ status: "failed", message: errorMessage(error) });
  }

  for (let attempt = 0; state.status === "pending" && state.transactionId && attempt < maxPolls; attempt++) {
    await sleep(pollIntervalMs);
    try {
      const status = await api.getStatus(state.transactionId);
      if (status === "completed") update({ ...state, status, message: "Your bill has been paid." });
      if (status === "failed") update({ ...state, status, message: "The provider could not complete this payment." });
    } catch {
      // Keep the payment pending; a transient status check failure is not a payment failure.
    }
  }

  return state;
};
