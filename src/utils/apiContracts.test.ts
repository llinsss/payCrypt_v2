import { describe, expect, it } from "vitest";
import {
  ApiContractError,
  parseAmountResponse,
  parseAuthResponse,
  parseTransactionList,
} from "./apiContracts";
import { amountSuccess, authSuccess, errorEnvelopes, transactionList } from "./__fixtures__/apiResponses";
import { mapBackendUserToAuthUser } from "./authApi";
import { mapBackendTransactionToTransaction } from "./transactionApi";

describe("frontend API response contracts", () => {
  it("accepts representative auth and payment success fixtures", () => {
    expect(parseAuthResponse(authSuccess)).toEqual(authSuccess);
    expect(parseTransactionList(transactionList)).toEqual(transactionList);
    expect(parseAmountResponse(amountSuccess)).toBe("25.00");
    expect(mapBackendUserToAuthUser(authSuccess.user).id).toBe("user-1");
    expect(mapBackendTransactionToTransaction(transactionList[0]).timestamp).toBe(
      transactionList[0].created_at
    );
  });

  it("accepts cookie-session auth responses without a browser-readable token", () => {
    const { token: _legacyToken, ...cookieSessionResponse } = authSuccess;
    expect(parseAuthResponse(cookieSessionResponse)).toEqual(cookieSessionResponse);
  });

  it("rejects malformed payment data without treating an error envelope as success", () => {
    expect(() => parseTransactionList(errorEnvelopes.server)).toThrow(ApiContractError);
    expect(() => parseTransactionList([{ ...transactionList[0], amount: "not-a-number" }])).toThrow(
      ApiContractError
    );
  });

  it("rejects malformed amount responses", () => {
    expect(() => parseAmountResponse(errorEnvelopes.server)).toThrow(ApiContractError);
    expect(() => parseAmountResponse({ amount: "unknown" })).toThrow(ApiContractError);
  });
});