const Redis = require('ioredis');
const promClient = require('prom-client');

const STUCK_THRESHOLD_MS = parseInt(process.env.STUCK_TX_THRESHOLD_MS) || 1_800_000; // 30 min

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const txConfirmationTime = new promClient.Histogram({
  name: 'tx_confirmation_seconds',
  help: 'Transaction confirmation time in seconds',
  labelNames: ['chain'],
  buckets: [10, 30, 60, 120, 300, 600, 1800],
  registers: [register],
});

const txFailedCounter = new promClient.Counter({
  name: 'tx_failed_total',
  help: 'Total failed transactions',
  labelNames: ['chain'],
  registers: [register],
});

const txStuckCounter = new promClient.Counter({
  name: 'tx_stuck_total',
  help: 'Total stuck transactions detected',
  labelNames: ['chain'],
  registers: [register],
});

const gasPrice = new promClient.Gauge({
  name: 'gas_price_gwei',
  help: 'Current gas price in Gwei',
  labelNames: ['chain'],
  registers: [register],
});

class ChainMonitorService {
  constructor(chainName, alertService) {
    this.chain = chainName;
    this.alertService = alertService;
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.interval = parseInt(process.env.MONITOR_INTERVAL) || 30_000;
    this.metrics = { txConfirmationTime, txFailedCounter, txStuckCounter, gasPrice, register };
  }

  // Override in subclass
  async fetchPendingTransactions() { return []; }
  async fetchTransactionStatus(txHash) { throw new Error('Not implemented'); }
  async fetchGasPrice() { throw new Error('Not implemented'); }
  async resubmitTransaction(txHash) { throw new Error('Not implemented'); }

  txKey(txHash) { return `monitor:${this.chain}:tx:${txHash}`; }

  async trackTransaction(txHash) {
    const key = this.txKey(txHash);
    const existing = await this.redis.get(key);
    if (!existing) {
      await this.redis.set(key, JSON.stringify({ hash: txHash, chain: this.chain, submittedAt: Date.now(), status: 'pending' }), 'EX', 7200);
    }
  }

  async checkStuckTransactions() {
    const keys = await this.redis.keys(`monitor:${this.chain}:tx:*`);
    const now = Date.now();
    for (const key of keys) {
      const raw = await this.redis.get(key);
      if (!raw) continue;
      const tx = JSON.parse(raw);
      if (tx.status === 'pending' && now - tx.submittedAt > STUCK_THRESHOLD_MS) {
        txStuckCounter.inc({ chain: this.chain });
        await this.alertService.send({
          level: 'warning',
          chain: this.chain,
          type: 'stuck_transaction',
          message: `Transaction ${tx.hash} on ${this.chain} has been pending for over 30 minutes`,
          data: tx,
        });
        try {
          await this.resubmitTransaction(tx.hash);
          await this.redis.set(key, JSON.stringify({ ...tx, status: 'resubmitted', resubmittedAt: now }), 'EX', 7200);
        } catch (err) {
          // resubmission failed — leave for next cycle
        }
      }
    }
  }

  async pollPendingTransactions() {
    const pending = await this.fetchPendingTransactions();
    for (const txHash of pending) {
      await this.trackTransaction(txHash);
      try {
        const status = await this.fetchTransactionStatus(txHash);
        const key = this.txKey(txHash);
        const raw = await this.redis.get(key);
        const tx = raw ? JSON.parse(raw) : { hash: txHash, chain: this.chain, submittedAt: Date.now() };

        if (status.confirmed) {
          const elapsed = (Date.now() - tx.submittedAt) / 1000;
          txConfirmationTime.observe({ chain: this.chain }, elapsed);
          await this.redis.del(key);
        } else if (status.failed) {
          txFailedCounter.inc({ chain: this.chain });
          await this.alertService.send({
            level: 'error',
            chain: this.chain,
            type: 'failed_transaction',
            message: `Transaction ${txHash} on ${this.chain} failed`,
            data: { txHash, ...status },
          });
          await this.redis.del(key);
        }
      } catch (_) { /* transient RPC error — retry next cycle */ }
    }
  }

  async monitorGasPrice() {
    try {
      const gwei = await this.fetchGasPrice();
      gasPrice.set({ chain: this.chain }, gwei);
      const threshold = parseFloat(process.env[`GAS_ALERT_THRESHOLD_${this.chain.toUpperCase()}`]) || 100;
      if (gwei > threshold) {
        await this.alertService.send({
          level: 'warning',
          chain: this.chain,
          type: 'high_gas',
          message: `Gas price on ${this.chain} is ${gwei} Gwei (threshold: ${threshold})`,
          data: { gwei, threshold },
        });
      }
    } catch (_) { /* RPC unavailable */ }
  }

  async runCycle() {
    await Promise.allSettled([
      this.pollPendingTransactions(),
      this.checkStuckTransactions(),
      this.monitorGasPrice(),
    ]);
  }

  start() {
    this.runCycle();
    this._timer = setInterval(() => this.runCycle(), this.interval);
  }

  stop() {
    clearInterval(this._timer);
    this.redis.disconnect();
  }
}

module.exports = { ChainMonitorService, metricsRegister: register };
