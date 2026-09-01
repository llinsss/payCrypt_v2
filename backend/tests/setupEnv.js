/**
 * Deterministic backend test environment bootstrap (issue #507).
 *
 * Several backend modules (config/jwt.js, config/database.js, config/redis.js,
 * config/cors.js, provider service singletons, ...) validate configuration at
 * import time. Without a fixed baseline, whether a test file even loads
 * successfully depends on the developer's local `.env` — or the lack of one —
 * so the same test can pass on one machine and fail on another.
 *
 * This file is registered as a Jest `setupFile` (see the `jest.setupFiles`
 * entry in package.json), which means it runs once per test file, before that
 * file's own imports, and therefore before any application module a test
 * pulls in. It:
 *
 *   1. Forces NODE_ENV=test so every import-time guard that already branches
 *      on NODE_ENV behaves consistently.
 *   2. Loads non-secret placeholder values from `.env.test` (a developer's
 *      own gitignored overrides, if present) or the committed
 *      `.env.test.example` — never the project's real `.env`, so no
 *      production credential can be loaded by the test bootstrap.
 *   3. Only fills variables that are not already set (`override: false`), so
 *      anything explicitly exported for a specific run still wins.
 *   4. Validates the result once, up front, with the exact schema the app
 *      uses at startup (config/env.validation.js) — which throws a regular
 *      Error rather than calling process.exit, so a misconfigured bootstrap
 *      fails the test run with a readable message instead of killing the
 *      whole worker process.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { validateEnv } from "../config/env.validation.js";

process.env.NODE_ENV = "test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");

// Prefer a developer-local `.env.test` (gitignored) if one exists, otherwise
// fall back to the committed, non-secret `.env.test.example`. Neither of
// these is the project's real `.env`.
const candidate = [".env.test", ".env.test.example"]
  .map((file) => path.join(backendRoot, file))
  .find((file) => fs.existsSync(file));

if (candidate) {
  dotenv.config({ path: candidate, override: false });
}

try {
  validateEnv(process.env);
} catch (error) {
  throw new Error(
    `Deterministic test environment bootstrap failed: ${error.message}\n` +
      `Checked ${candidate ?? "backend/.env.test.example (missing)"} against config/env.validation.js. ` +
      "Add the missing variables there so a clean checkout can run tests without a personal .env.",
  );
}
