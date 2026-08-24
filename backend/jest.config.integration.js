/**
 * Jest configuration for integration tests
 *
 * Integration tests require a live PostgreSQL connection.
 * See setup.integration.js for environment validation and
 * TESTING.md / CONTRIBUTING.md for setup instructions.
 *
 * Test Pattern: *.integration.test.js only
 */

export default {
  testEnvironment: "node",
  transform: {},
  roots: ["<rootDir>/tests"],
  testPathIgnorePatterns: ["/node_modules/"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.integration.js"],
  testMatch: ["**/*.integration.test.js"],
  forceExit: true,
};
