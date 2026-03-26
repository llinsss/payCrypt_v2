jest.mock('ioredis', () => {
  const store = {};
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(k => Promise.resolve(store[k] || null)),
    set: jest.fn((k, v) => { store[k] = v; return Promise.resolve('OK'); }),
    del: jest.fn(k => { delete store[k]; return Promise.resolve(1); }),
    keys: jest.fn(pattern => {
      const prefix = pattern.replace('*', '');
      return Promise.resolve(Object.keys(store).filter(k => k.startsWith(prefix)));
    }),
    disconnect: jest.fn(),
  }));
});

jest.mock('prom-client', () => {
  const noop = () => {};
  const mock = { inc: noop, observe: noop, set: noop };
  return {
    Registry: jest.fn().mockImplementation(() => ({
      contentType: 'text/plain',
      metrics: jest.fn().mockResolvedValue('# metrics'),
    })),
    collectDefaultMetrics: noop,
    Histogram: jest.fn().mockImplementation(() => mock),
    Counter: jest.fn().mockImplementation(() => mock),
    Gauge: jest.fn().mockImplementation(() => mock),
  };
});

const { ChainMonitorService } = require('../services/ChainMonitorService');
const AlertService = require('../services/AlertService');

class TestMonitor extends ChainMonitorService {
  constructor(alertService) {
    super('testchain', alertService);
    this._pending = [];
    this._statuses = {};
    this._gasPrice = 10;
  }
  async fetchPendingTransactions() { return this._pending; }
  async fetchTransactionStatus(txHash) { return this._statuses[txHash] || { confirmed: false, failed: false }; }
  async fetchGasPrice() { return this._gasPrice; }
  async resubmitTransaction(txHash) { this._resubmitted = txHash; }
}

describe('ChainMonitorService', () => {
  let alertService, monitor;

  beforeEach(() => {
    alertService = { send: jest.fn().mockResolvedValue() };
    monitor = new TestMonitor(alertService);
  });

  afterEach(() => monitor.redis.disconnect());

  test('trackTransaction stores tx in Redis', async () => {
    await monitor.trackTransaction('0xabc');
    const raw = await monitor.redis.get('monitor:testchain:tx:0xabc');
    expect(JSON.parse(raw)).toMatchObject({ hash: '0xabc', status: 'pending' });
  });

  test('pollPendingTransactions removes confirmed tx and records metric', async () => {
    monitor._pending = ['0xconfirmed'];
    monitor._statuses['0xconfirmed'] = { confirmed: true, failed: false };
    await monitor.trackTransaction('0xconfirmed');
    await monitor.pollPendingTransactions();
    const raw = await monitor.redis.get('monitor:testchain:tx:0xconfirmed');
    expect(raw).toBeNull();
  });

  test('pollPendingTransactions alerts and removes failed tx', async () => {
    monitor._pending = ['0xfailed'];
    monitor._statuses['0xfailed'] = { confirmed: false, failed: true };
    await monitor.trackTransaction('0xfailed');
    await monitor.pollPendingTransactions();
    expect(alertService.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'failed_transaction' }));
    const raw = await monitor.redis.get('monitor:testchain:tx:0xfailed');
    expect(raw).toBeNull();
  });

  test('checkStuckTransactions alerts and resubmits old pending tx', async () => {
    const key = 'monitor:testchain:tx:0xstuck';
    await monitor.redis.set(key, JSON.stringify({
      hash: '0xstuck', chain: 'testchain',
      submittedAt: Date.now() - 2_000_000,
      status: 'pending',
    }));
    await monitor.checkStuckTransactions();
    expect(alertService.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'stuck_transaction' }));
    expect(monitor._resubmitted).toBe('0xstuck');
  });

  test('monitorGasPrice sends alert when gas exceeds threshold', async () => {
    process.env.GAS_ALERT_THRESHOLD_TESTCHAIN = '5';
    monitor._gasPrice = 50;
    await monitor.monitorGasPrice();
    expect(alertService.send).toHaveBeenCalledWith(expect.objectContaining({ type: 'high_gas' }));
    delete process.env.GAS_ALERT_THRESHOLD_TESTCHAIN;
  });

  test('monitorGasPrice does not alert when gas is below threshold', async () => {
    process.env.GAS_ALERT_THRESHOLD_TESTCHAIN = '100';
    monitor._gasPrice = 10;
    await monitor.monitorGasPrice();
    expect(alertService.send).not.toHaveBeenCalled();
    delete process.env.GAS_ALERT_THRESHOLD_TESTCHAIN;
  });
});

describe('AlertService', () => {
  test('send does not throw when no webhook/email configured', async () => {
    const svc = new AlertService();
    await expect(svc.send({ level: 'error', chain: 'base', type: 'test', message: 'hi' })).resolves.not.toThrow();
  });
});
