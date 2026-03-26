const { metricsRegister } = require('../services/ChainMonitorService');
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const CHAINS = ['starknet', 'base', 'flow', 'lisk', 'u2u'];

async function getMetrics(req, res) {
  res.set('Content-Type', metricsRegister.contentType);
  res.end(await metricsRegister.metrics());
}

async function getTransactionStatus(req, res) {
  const { chain, txHash } = req.params;
  if (!CHAINS.includes(chain)) return res.status(400).json({ error: 'Unknown chain' });
  const raw = await redis.get(`monitor:${chain}:tx:${txHash}`);
  if (!raw) return res.status(404).json({ error: 'Transaction not tracked' });
  res.json(JSON.parse(raw));
}

async function getPendingTransactions(req, res) {
  const { chain } = req.params;
  if (!CHAINS.includes(chain)) return res.status(400).json({ error: 'Unknown chain' });
  const keys = await redis.keys(`monitor:${chain}:tx:*`);
  const txs = await Promise.all(keys.map(async k => {
    const raw = await redis.get(k);
    return raw ? JSON.parse(raw) : null;
  }));
  res.json(txs.filter(Boolean));
}

async function trackTransaction(req, res) {
  const { chain, txHash } = req.body;
  if (!CHAINS.includes(chain)) return res.status(400).json({ error: 'Unknown chain' });
  if (!txHash) return res.status(400).json({ error: 'txHash required' });
  const key = `monitor:${chain}:tx:${txHash}`;
  const existing = await redis.get(key);
  if (!existing) {
    await redis.set(key, JSON.stringify({ hash: txHash, chain, submittedAt: Date.now(), status: 'pending' }), 'EX', 7200);
  }
  res.json({ tracked: true, txHash, chain });
}

module.exports = { getMetrics, getTransactionStatus, getPendingTransactions, trackTransaction };
