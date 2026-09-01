import request from "supertest";
import { describe, expect, it } from "@jest/globals";
import app from "../app.js";

describe("Sentry test error route", () => {
  it("is available in the test environment and deliberately fails", async () => {
    const response = await request(app).get("/test-error");

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Sentry Test Error manually triggered");
  });

  it("is guarded by the production environment check", async () => {
    const source = await import("node:fs/promises");
    const appSource = await source.readFile(new URL("../app.js", import.meta.url), "utf8");

    expect(appSource).toMatch(
      /if \(process\.env\.NODE_ENV !== "production"\) \{[\s\S]*app\.get\("\/test-error"/,
    );
  });
});
