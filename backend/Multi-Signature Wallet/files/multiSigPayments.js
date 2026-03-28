'use strict';

/**
 * Multi-sig payment routes
 *
 * Mount in server.js:
 *   const multiSigRoutes = require('./routes/multiSigPayments');
 *   app.use('/api/payments/multi-sig', multiSigRoutes(deps));
 */

const { Router } = require('express');
const { body, param, query } = require('express-validator');

/**
 * @param {object} deps
 * @param {MultiSigPaymentController} deps.controller
 * @param {Function} deps.authenticate   - Auth middleware (sets req.user)
 * @param {Function} [deps.requireAdmin] - Optional role-check middleware
 */
module.exports = function multiSigPaymentRoutes({ controller, authenticate, requireAdmin }) {
  const router = Router();

  // ── Common validators ────────────────────────────────────────────────────

  const stellarKey = (field) =>
    body(field)
      .isString()
      .isLength({ min: 56, max: 56 })
      .withMessage(`${field} must be a 56-character Stellar public key`);

  const uuidParam = param('id').isUUID().withMessage('id must be a valid UUID');

  // ── Routes ────────────────────────────────────────────────────────────────

  /**
   * GET /api/payments/multi-sig/pending?signer=G…
   * List pending requests for a signer (must be before /:id to avoid clash)
   */
  router.get(
    '/pending',
    authenticate,
    [query('signer').optional().isLength({ min: 56, max: 56 })],
    controller.listPendingForSigner
  );

  /**
   * POST /api/payments/multi-sig
   * Create a new multi-sig payment request (admin only)
   */
  router.post(
    '/',
    authenticate,
    ...(requireAdmin ? [requireAdmin] : []),
    [
      stellarKey('sourceAccount'),
      stellarKey('destinationAccount'),
      body('amount')
        .isNumeric()
        .isFloat({ min: 0.0000001 })
        .withMessage('amount must be a positive number'),
      body('assetCode').optional().isString().isLength({ max: 12 }),
      body('assetIssuer').optional().isLength({ min: 56, max: 56 }),
      body('memo').optional().isString().isLength({ max: 28 }),
      body('requiredSignatures')
        .isInt({ min: 2, max: 10 })
        .withMessage('requiredSignatures must be an integer between 2 and 10'),
      body('authorizedSigners')
        .isArray({ min: 2 })
        .withMessage('authorizedSigners must be an array of at least 2 keys'),
      body('authorizedSigners.*')
        .isLength({ min: 56, max: 56 })
        .withMessage('Each authorized signer must be a 56-char Stellar public key'),
    ],
    controller.createPaymentRequest
  );

  /**
   * GET /api/payments/multi-sig/:id
   * View a specific payment request
   */
  router.get('/:id', authenticate, [uuidParam], controller.getPaymentRequest);

  /**
   * POST /api/payments/multi-sig/:id/sign
   * Submit a signature for a pending payment
   */
  router.post(
    '/:id/sign',
    authenticate,
    [
      uuidParam,
      body('signedEnvelopeXdr')
        .isString()
        .notEmpty()
        .withMessage('signedEnvelopeXdr is required'),
    ],
    controller.submitSignature
  );

  /**
   * POST /api/payments/multi-sig/:id/submit
   * Manually submit a ready payment to the Stellar network
   */
  router.post(
    '/:id/submit',
    authenticate,
    ...(requireAdmin ? [requireAdmin] : []),
    [uuidParam],
    controller.submitToNetwork
  );

  return router;
};
