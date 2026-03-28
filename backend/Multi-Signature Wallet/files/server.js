'use strict';

/**
 * server.js  (excerpt — add multi-sig wiring to your existing server)
 *
 * Shows how to:
 *  1. Instantiate MultiSigService with its dependencies
 *  2. Wire up the controller and routes
 *  3. Register the BullMQ expiry worker
 *
 * Drop these blocks into the appropriate sections of your existing server.js.
 */

const express = require('express');
const { Queue, Worker } = require('bullmq');

const MultiSigService = require('./services/MultiSigService');
const MultiSigPaymentController = require('./controllers/multiSigPaymentController');
const multiSigPaymentRoutes = require('./routes/multiSigPayments');

// ── Your existing imports ─────────────────────────────────────────────────
// const db = require('./models');
// const notificationService = require('./services/NotificationService');
// const authenticate = require('./middleware/authenticate');
// const requireAdmin = require('./middleware/requireAdmin');

module.exports = async function bootstrapMultiSig(app, { db, notificationService, authenticate, requireAdmin, redisConnection }) {
  // ── 1. BullMQ queue ─────────────────────────────────────────────────────
  const expiryQueue = new Queue('multisig-expiry', { connection: redisConnection });

  // ── 2. Service ───────────────────────────────────────────────────────────
  const multiSigService = new MultiSigService({
    models: {
      MultiSigPayment: db.MultiSigPayment,
      MultiSigSignature: db.MultiSigSignature,
    },
    notificationService,
    expiryQueue,
    stellarHorizonUrl: process.env.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
    networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE,
  });

  // ── 3. Controller + Routes ────────────────────────────────────────────────
  const controller = new MultiSigPaymentController(multiSigService);

  app.use(
    '/api/payments/multi-sig',
    multiSigPaymentRoutes({ controller, authenticate, requireAdmin })
  );

  // ── 4. BullMQ Worker (expiry) ─────────────────────────────────────────────
  const expiryWorker = new Worker(
    'multisig-expiry',
    async (job) => {
      const { paymentId } = job.data;
      console.log(`[MultiSig] Expiring payment ${paymentId}`);
      await multiSigService.expirePayment(paymentId);
    },
    { connection: redisConnection }
  );

  expiryWorker.on('failed', (job, err) => {
    console.error(`[MultiSig] Expiry job failed for ${job?.data?.paymentId}:`, err);
  });

  console.log('[MultiSig] Routes registered at /api/payments/multi-sig');
  console.log('[MultiSig] BullMQ expiry worker started');

  return { multiSigService, expiryQueue, expiryWorker };
};

// ── Example: integrate in an existing server ─────────────────────────────────
//
// const app = express();
// ...your existing middleware...
//
// (async () => {
//   await bootstrapMultiSig(app, {
//     db,
//     notificationService,
//     authenticate,
//     requireAdmin,
//     redisConnection: { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT },
//   });
//
//   app.listen(3000, () => console.log('Server running on port 3000'));
// })();
