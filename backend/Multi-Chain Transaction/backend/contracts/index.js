const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

/**
 * Call this after submitting any transaction to register it for monitoring.
 * @param {string} chain - one of: starknet, base, flow, lisk, u2u
 * @param {string} txHash
 */
async function onTransactionSubmitted(chain, txHash) {
  const key = `monitor:${chain}:tx:${txHash}`;
  const existing = await redis.get(key);
  if (!existing) {
    await redis.set(
      key,
      JSON.stringify({ hash: txHash, chain, submittedAt: Date.now(), status: 'pending' }),
      'EX', 7200
    );
  }
}

module.exports = { onTransactionSubmitted };
