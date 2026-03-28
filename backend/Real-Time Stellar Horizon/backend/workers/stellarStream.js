require('dotenv').config();
const { Worker } = require('bullmq');
const mongoose = require('mongoose');
const redis = require('../config/redis');
const StellarStreamService = require('../services/StellarStreamService');

const QUEUE_NAME = 'stellar-stream';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stellar_horizon');
  await redis.connect();

  const streamService = new StellarStreamService();

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === 'start') await streamService.start();
      if (job.name === 'reload-addresses') await streamService.loadAddresses();
    },
    { connection: redis }
  );

  worker.on('failed', (job, err) => console.error(`[Worker] Job ${job?.name} failed:`, err.message));

  // Start stream immediately
  await streamService.start();
  console.log('[Worker] Stellar stream worker started');

  process.on('SIGTERM', () => { streamService.stop(); worker.close(); process.exit(0); });
  process.on('SIGINT', () => { streamService.stop(); worker.close(); process.exit(0); });
}

main().catch((err) => { console.error('[Worker] Fatal:', err); process.exit(1); });
