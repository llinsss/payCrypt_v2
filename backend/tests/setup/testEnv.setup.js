/**
 * Deterministic backend test environment bootstrap (issue #507).
 *
 * Runs once per Jest worker, before any test file (or the modules it
 * imports) executes — wired in via the `setupFiles` entry in package.json's
 * jest config, which Jest guarantees runs ahead of the test framework and
 * every test module.
 *
 * Why this exists: several modules (config/jwt.js, config/env.validation.js
 * consumers, provider services) read `process.env` at import time, and some
 * historically called `process.exit` when a value was missing. On a clean
 * checkout with no personal `.env`, that made unit tests fail inconsistently
 * depending on what happened to be in the developer's shell/`.env`. This file
 * guarantees:
 *
 *   1. NODE_ENV is "test" before anything else loads, so the `NODE_ENV !==
 *      "test"` guards in config/jwt.js and config/redis.js are active and
 *      never call process.exit or dial a real Redis.
 *   2. Test configuration comes only from `.env.test` (git-ignored, optional)
 *      layered over the committed `.env.test.example` defaults — never from
 *      a developer's real `.env`, so no production credential can be loaded
 *      by the test bootstrap.
 *   3. The resulting config is validated once, up front, via the same
 *      `validateEnv` schema production uses. An invalid/incomplete test
 *      environment fails immediately with a clear message instead of
 *      surfacing as confusing failures scattered across the suite.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "../..");

// Force test mode before any other module (including ones this file imports
// below) can observe process.env.
process.env.NODE_ENV = "test";

/**
 * Layer env files: committed non-secret defaults first, then an optional
 * developer-local `.env.test` override. Neither call ever overwrites a
 * variable already present in process.env (e.g. set by CI), and neither
 * touches `.env` / `.env.local` — the files that may hold real credentials.
 */
function loadEnvFile(filename) {
  const filePath = path.join(backendRoot, filename);
  if (!fs.existsSync(filePath)) return;
  dotenv.config({ path: filePath });
}

loadEnvFile(".env.test.example");
loadEnvFile(".env.test");

// Belt-and-suspenders: guarantee the handful of variables integration
// prerequisites and unit tests rely on most are always present, even if
// `.env.test.example` is ever edited out from under this file.
const REQUIRED_TEST_DEFAULTS = {
  PORT: "3001",
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_NAME: "taggedpay_test",
  DB_USER: "taggedpay_test",
  DB_PASSWORD: "taggedpay_test_password",
  JWT_SECRET: "test-jwt-secret-with-at-least-32-characters",
  BULL_ADMIN_USER: "bull-admin-test",
  BULL_ADMIN_PASS: "bull-admin-test-password",
  SWAGGER_ADMIN_USER: "swagger-admin-test",
  SWAGGER_ADMIN_PASS: "swagger-admin-test-password",
  CORS_ORIGIN: "http://localhost:5173",
  REDIS_DISABLED: "true",
};

for (const [key, value] of Object.entries(REQUIRED_TEST_DEFAULTS)) {
  if (!process.env[key]) process.env[key] = value;
}

// Validate once, up front, using the same schema production startup uses
// (config/env.validation.js). A broken test environment should fail loudly
// before any suite runs rather than as a wall of unrelated test failures.
try {
  const { validateEnv } = await import("../../config/env.validation.js");
  validateEnv(process.env);
} catch (error) {
  // Thrown from setupFiles, this aborts the whole Jest run with the message
  // below — exactly the "testable configuration error" the issue asks for,
  // in place of a raw process.exit from deep inside some imported module.
  throw new Error(
    `Test environment bootstrap failed: ${error.message}\n` +
      "Check backend/.env.test.example (and, if present, backend/.env.test).",
  );
}
