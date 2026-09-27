import { jest, describe, it, expect } from "@jest/globals";
import express from "express";
import request from "supertest";

const mockPay = jest.fn();
jest.unstable_mockModule("../services/BillPaymentService.js", () => ({
  default: {
    getCategories: jest.fn().mockResolvedValue([{ id: "airtime", name: "Airtime" }]),
    getProvidersForCategory: jest.fn().mockResolvedValue([{ id: "mtn", name: "MTN" }]),
    processBillPayment: mockPay,
  },
}));

const { default: billRoutes } = await import("../routes/bills.js");

const app = express();
app.use(express.json());
app.use("/api/bills", billRoutes);

describe("bill payment routes", () => {
  it("serves providers for the web bill payment form", async () => {
    const res = await request(app).get("/api/bills/providers/airtime");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "success", data: [{ id: "mtn", name: "MTN" }] });
  });

  it("requires authentication to pay a bill", async () => {
    const res = await request(app)
      .post("/api/bills/pay")
      .send({ category: "airtime", provider: "mtn", phone: "08012345678", amount: 500 });

    expect(res.status).toBe(401);
    expect(mockPay).not.toHaveBeenCalled();
  });
});
