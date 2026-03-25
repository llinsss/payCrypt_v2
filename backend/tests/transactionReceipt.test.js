import { describe, it, expect, afterEach } from "@jest/globals";
import { getTransactionReceipt } from "../controllers/transactionController.js";
import Transaction from "../models/Transaction.js";
import ReceiptService from "../services/ReceiptService.js";

function mockResponse() {
  const res = {};
  res.statusCode = 200;
  res.headers = {};
  res.body = null;

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (payload) => {
    res.body = payload;
    return res;
  };

  res.set = (headers) => {
    res.headers = { ...res.headers, ...headers };
    return res;
  };

  res.send = (payload) => {
    res.body = payload;
    return res;
  };

  return res;
}

afterEach(() => {
  Transaction.findById = originalFindById;
  ReceiptService.generateReceipt = originalGenerateReceipt;
});

const originalFindById = Transaction.findById;
const originalGenerateReceipt = ReceiptService.generateReceipt;

describe("GET /transactions/:id/receipt controller", () => {
  it("returns 404 when transaction does not exist", async () => {
    Transaction.findById = async () => null;

    const req = { params: { id: "999" }, user: { id: 1 } };
    const res = mockResponse();

    await getTransactionReceipt(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Transaction not found" });
  });

  it("returns 403 when requester is not owner", async () => {
    Transaction.findById = async () => ({ id: 10, user_id: 2, status: "completed" });

    const req = { params: { id: "10" }, user: { id: 1 } };
    const res = mockResponse();

    await getTransactionReceipt(req, res);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 when transaction is not completed", async () => {
    Transaction.findById = async () => ({ id: 10, user_id: 1, status: "pending" });

    const req = { params: { id: "10" }, user: { id: 1 } };
    const res = mockResponse();

    await getTransactionReceipt(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Receipt only available for completed transactions" });
  });

  it("returns PDF buffer and headers for completed transaction", async () => {
    const transaction = { id: 10, user_id: 1, status: "completed" };
    const pdfBuffer = Buffer.from("%PDF-mock%");

    Transaction.findById = async () => transaction;
    ReceiptService.generateReceipt = async () => pdfBuffer;

    const req = { params: { id: "10" }, user: { id: 1 } };
    const res = mockResponse();

    await getTransactionReceipt(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/pdf");
    expect(res.headers["Content-Disposition"]).toBe("attachment; filename=\"receipt-10.pdf\"");
    expect(res.headers["Content-Length"]).toBe(String(pdfBuffer.length));
    expect(res.body).toBe(pdfBuffer);
  });
});
