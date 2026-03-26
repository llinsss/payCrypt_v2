'use strict';

const { getPoolMetrics, checkPoolHealth } = require('../utils/dbPoolMonitor');

function makeKnex({ used = 2, free = 3, pendingAcquires = 0, pendingCreates = 0, min = 2, max = 10 } = {}) {
  return {
    client: {
      pool: {
        numUsed: () => used,
        numFree: () => free,
        numPendingAcquires: () => pendingAcquires,
        numPendingCreates: () => pendingCreates,
        min,
        max,
      },
    },
    raw: jest.fn().mockResolvedValue(true),
  };
}

describe('getPoolMetrics', () => {
  it('returns correct metric shape', () => {
    const metrics = getPoolMetrics(makeKnex());
    expect(metrics).toMatchObject({ used: 2, free: 3, min: 2, max: 10 });
    expect(metrics.total).toBe(5);
  });
});

describe('checkPoolHealth', () => {
  it('returns healthy when query succeeds', async () => {
    const result = await checkPoolHealth(makeKnex());
    expect(result.healthy).toBe(true);
    expect(result.metrics).toBeDefined();
  });

  it('returns unhealthy when query fails', async () => {
    const knex = makeKnex();
    knex.raw = jest.fn().mockRejectedValue(new Error('connection refused'));
    const result = await checkPoolHealth(knex);
    expect(result.healthy).toBe(false);
    expect(result.error).toBe('connection refused');
  });
});

describe('pool configuration', () => {
  it('pool min is less than pool max', () => {
    const { poolConfig } = require('../config/database');
    expect(poolConfig.min).toBeLessThan(poolConfig.max);
  });

  it('acquireTimeoutMillis is positive', () => {
    const { poolConfig } = require('../config/database');
    expect(poolConfig.acquireTimeoutMillis).toBeGreaterThan(0);
  });
});
