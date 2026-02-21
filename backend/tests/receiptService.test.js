import { describe, it, expect } from "@jest/globals";
import ReceiptService from "../services/ReceiptService.js";

describe("ReceiptService.generateReceipt", () => {
  it("returns a PDF buffer for transaction data", async () => {
    const transaction = {
      id: 101,
      tx_hash: "abc123hash",
      amount: "42.5000000000",
      token_symbol: "USDC",
      from_address: "GFROMADDRESS",
      to_address: "GTOADDRESS",
      status: "completed",
      created_at: "2026-02-20T10:30:00.000Z",
      extra: JSON.stringify({ fee: "0.1000000000" }),
    };

    const buffer = await ReceiptService.generateReceipt(transaction);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.toString("ascii", 0, 5)).toBe("%PDF-");
  });
});
