import express from "express";
import request from "supertest";
import { describe, it, expect, afterEach } from "@jest/globals";

import { getTransactionReceipt } from "../controllers/transactionController.js";
import Transaction from "../models/Transaction.js";
import ReceiptService from "../services/ReceiptService.js";

const originalFindById = Transaction.findById;
const originalGenerateReceipt = ReceiptService.generateReceipt;

function buildApp() {
  const app = express();
  app.get("/api/transactions/:id/receipt", (req, _res, next) => {
    req.user = { id: 1 };
    next();
  }, getTransactionReceipt);
  return app;
}

afterEach(() => {
  Transaction.findById = originalFindById;
  ReceiptService.generateReceipt = originalGenerateReceipt;
});

describe("GET /api/transactions/:id/receipt integration", () => {
  it("returns a PDF response for an owned completed transaction", async () => {
    const app = buildApp();
    const pdfBuffer = Buffer.from("%PDF-mock%");

    Transaction.findById = async () => ({
      id: 77,
      user_id: 1,
      status: "completed",
    });
    ReceiptService.generateReceipt = async () => pdfBuffer;

    const res = await request(app).get("/api/transactions/77/receipt");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.headers["content-disposition"]).toBe("attachment; filename=\"receipt-77.pdf\"");
    expect(res.headers["content-length"]).toBe(String(pdfBuffer.length));
    expect(Buffer.compare(Buffer.from(res.body), pdfBuffer)).toBe(0);
  });

  it("returns 400 when transaction is not completed", async () => {
    const app = buildApp();
    Transaction.findById = async () => ({
      id: 88,
      user_id: 1,
      status: "pending",
    });

    const res = await request(app).get("/api/transactions/88/receipt");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Receipt only available for completed transactions" });
  });
});
