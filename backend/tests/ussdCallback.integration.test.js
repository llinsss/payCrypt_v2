import express from "express";
import request from "supertest";
import { describe, it, expect, beforeEach, jest } from "@jest/globals";

const handleUssdRequest = jest.fn();

jest.unstable_mockModule("../services/UssdService.js", () => ({
  default: {
    handleUssdRequest,
  },
}));

jest.unstable_mockModule("../middleware/auth.js", () => ({
  authenticate: (_req, _res, next) => next(),
}));

const { default: ussdRoutes } = await import("../routes/ussd.js");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/ussd", ussdRoutes);
  return app;
}

describe("POST /api/ussd/callback integration", () => {
  beforeEach(() => {
    handleUssdRequest.mockReset();
  });

  it("returns the USSD service message as plain text", async () => {
    handleUssdRequest.mockResolvedValue({
      message: "CON Welcome to Tagged",
      continueSession: true,
    });

    const res = await request(buildApp()).post("/api/ussd/callback").send({
      sessionId: "session-123",
      serviceCode: "*123#",
      phoneNumber: "+2348012345678",
      text: "",
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toBe("CON Welcome to Tagged");
    expect(handleUssdRequest).toHaveBeenCalledWith(
      "session-123",
      "+2348012345678",
      "",
    );
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await request(buildApp()).post("/api/ussd/callback").send({
      phoneNumber: "+2348012345678",
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: true,
      message: "Missing required fields",
    });
  });
});
