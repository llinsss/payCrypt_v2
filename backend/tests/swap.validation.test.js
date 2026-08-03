import { describe, expect, it } from "@jest/globals";
import express from "express";
import request from "supertest";

import { validate } from "../middleware/validation.js";
import { swapRequestSchema } from "../schemas/swap.js";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.post("/swap", validate(swapRequestSchema), (req, res) => {
    res.json({ body: req.body });
  });
  return app;
};

describe("swap request validation", () => {
  it("accepts a valid quote request", async () => {
    const res = await request(buildApp()).post("/swap").send({
      fromToken: "STRK",
      toToken: "BASE",
      amount: "12.5",
      chainId: "STRK",
      slippageBps: 75,
    });

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({
      action: "quote",
      fromToken: "STRK",
      toToken: "BASE",
      amount: 12.5,
      chainId: "STRK",
      slippageBps: 75,
    });
  });

  it("requires core quote fields", async () => {
    const res = await request(buildApp()).post("/swap").send({
      fromToken: "STRK",
      amount: "1",
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "toToken" }),
        expect.objectContaining({ field: "chainId" }),
      ]),
    );
  });

  it("rejects same-token swaps", async () => {
    const res = await request(buildApp()).post("/swap").send({
      fromToken: "STRK",
      toToken: "strk",
      amount: "1",
      chainId: "STRK",
    });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toContain("fromToken and toToken must be different");
  });

  it("accepts a valid confirm request", async () => {
    const res = await request(buildApp()).post("/swap").send({
      action: "confirm",
      quoteId: "6f6e886d-f5dd-4f4a-983a-764f57d4c7aa",
    });

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({
      action: "confirm",
      quoteId: "6f6e886d-f5dd-4f4a-983a-764f57d4c7aa",
    });
  });

  it("requires quoteId when confirming", async () => {
    const res = await request(buildApp()).post("/swap").send({
      action: "confirm",
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "quoteId" })]),
    );
  });
});
