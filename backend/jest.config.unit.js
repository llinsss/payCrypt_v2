/**
 * Jest configuration for unit tests
 *
 * Unit tests run without requiring a live database.
 * Database layer is mocked via setup.unit.js
 * allowing services to be imported and tested in isolation.
 *
 * Test Pattern: *.test.js (excludes *.integration.test.js)
 */

export default {
  testEnvironment: "node",
  transform: {},
  roots: ["<rootDir>/tests"],
  testPathIgnorePatterns: ["/node_modules/", ".integration.test.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.unit.js"],
  testMatch: ["**/*.test.js", "!**/*.integration.test.js"],
  forceExit: true,
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "<rootDir>/test-results/unit",
        outputName: "results.xml",
        classNameTemplate: "{classname}",
        titleTemplate: "{title}",
        ancestorSeparator: " › ",
        usePathAsClassName: true,
      },
    ],
  ],
};
