/**
 * Jest setup for integration tests
 *
 * Ensures integration test environment is properly configured with
 * a disposable PostgreSQL connection before tests run.
 *
 * This setup runs before integration tests and verifies DATABASE_URL
 * is set with a clear error message if the requirement is not met.
 */

// Verify DATABASE_URL is configured for integration tests
function validateIntegrationEnvironment() {
  const requiredVars = ["DATABASE_URL"];
  const missing = requiredVars.filter((v) => !process.env[v]);

  if (missing.length > 0) {
    throw new Error(
      `Integration tests require environment variables: ${missing.join(", ")}\n\n` +
      `See CONTRIBUTING.md for setup instructions:\n` +
      `  1. Start PostgreSQL (docker-compose up -d postgres)\n` +
      `  2. Set DATABASE_URL=postgres://user:password@localhost:5432/paycrypt_test\n` +
      `  3. Run: npm run test:integration\n`
    );
  }
}

validateIntegrationEnvironment();
