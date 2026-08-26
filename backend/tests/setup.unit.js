/**
 * Jest setup for unit tests
 *
 * Mocks the database layer before any service imports occur,
 * preventing import-time failures when DATABASE_URL is not configured.
 *
 * This setup runs before ALL unit tests, allowing services to be
 * imported without requiring a live PostgreSQL connection.
 */

import { jest } from "@jest/globals";

// Mock the database connection before any service imports
jest.mock("../config/database.js", () => ({
  __esModule: true,
  default: {
    // Mock Knex query builder interface
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    first: jest.fn().mockResolvedValue(null),
    then: jest.fn().mockResolvedValue(null),
    catch: jest.fn().mockImplementation((fn) => fn()),
    on: jest.fn().mockReturnThis(),
    raw: jest.fn().mockResolvedValue({}),
    schema: {
      createTable: jest.fn().mockReturnThis(),
      dropTable: jest.fn().mockReturnThis(),
      table: jest.fn().mockReturnThis(),
    },
    migrate: {
      latest: jest.fn().mockResolvedValue([]),
      rollback: jest.fn().mockResolvedValue([]),
    },
    seed: {
      run: jest.fn().mockResolvedValue([]),
    },
  },
  getPoolMetrics: jest.fn().mockReturnValue(null),
  checkConnectionHealth: jest.fn().mockResolvedValue({
    healthy: true,
    latencyMs: 0,
    pool: null,
  }),
  ensureConnectionWithRetry: jest.fn().mockResolvedValue({ ok: true }),
  stopPoolMonitoring: jest.fn(),
}));
