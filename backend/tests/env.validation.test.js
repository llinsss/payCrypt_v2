import { describe, expect, it } from "@jest/globals";
import { validateEnv } from "../config/env.validation.js";

const validEnv = {
  NODE_ENV: "test",
  PORT: "3000",
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_NAME: "taggedpay",
  DB_USER: "taggedpay_user",
  DB_PASSWORD: "secret",
  JWT_SECRET: "a-secure-test-secret-that-is-at-least-32-chars",
  BULL_ADMIN_USER: "bull-admin",
  BULL_ADMIN_PASS: "bull-password",
  SWAGGER_ADMIN_USER: "swagger-admin",
  SWAGGER_ADMIN_PASS: "swagger-password",
  CORS_ORIGIN: "http://localhost:5173",
};

describe("environment validation", () => {
  it("normalizes valid configuration", () => {
    const env = validateEnv(validEnv);

    expect(env.PORT).toBe(3000);
    expect(env.DB_PORT).toBe(5432);
    expect(env.DB_NAME).toBe("taggedpay");
  });

  it("reports every missing required variable", () => {
    expect(() => validateEnv({})).toThrow(
      /DB_HOST[\s\S]*DB_NAME[\s\S]*DB_USER[\s\S]*JWT_SECRET[\s\S]*BULL_ADMIN_USER/
    );
  });

  it("rejects malformed secrets, ports, and URLs", () => {
    expect(() => validateEnv({
      ...validEnv,
      PORT: "70000",
      JWT_SECRET: "short",
      CORS_ORIGIN: "not-a-url",
      RPC_URL: "not-a-url",
    })).toThrow(/PORT[\s\S]*JWT_SECRET[\s\S]*CORS_ORIGIN[\s\S]*RPC_URL/);
  });
});

