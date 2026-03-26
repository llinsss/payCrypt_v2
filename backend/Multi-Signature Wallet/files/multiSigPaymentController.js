'use strict';

/**
 * multiSigPaymentController
 *
 * Express request handlers for all multi-sig payment endpoints.
 * Keeps HTTP concerns (validation, response shaping) separate from
 * business logic (MultiSigService).
 */

const { validationResult } = require('express-validator');

class MultiSigPaymentController {
  /**
   * @param {MultiSigService} multiSigService
   */
  constructor(multiSigService) {
    this.multiSigService = multiSigService;

    // Bind methods so they survive Express's router.get(path, handler) pattern
    this.createPaymentRequest = this.createPaymentRequest.bind(this);
    this.getPaymentRequest = this.getPaymentRequest.bind(this);
    this.submitSignature = this.submitSignature.bind(this);
    this.submitToNetwork = this.submitToNetwork.bind(this);
    this.listPendingForSigner = this.listPendingForSigner.bind(this);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  POST /api/payments/multi-sig
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new multi-sig payment request.
   *
   * Body: {
   *   sourceAccount, destinationAccount, amount,
   *   assetCode?, assetIssuer?, memo?,
   *   requiredSignatures, authorizedSigners[]
   * }
   */
  async createPaymentRequest(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        sourceAccount,
        destinationAccount,
        amount,
        assetCode,
        assetIssuer,
        memo,
        requiredSignatures,
        authorizedSigners,
      } = req.body;

      // `req.user.publicKey` set by your auth middleware
      const createdBy = req.user?.publicKey ?? req.body.createdBy;

      const payment = await this.multiSigService.createPaymentRequest({
        sourceAccount,
        destinationAccount,
        amount: String(amount),
        assetCode,
        assetIssuer,
        memo,
        requiredSignatures: Number(requiredSignatures),
        authorizedSigners,
        createdBy,
      });

      return res.status(201).json({
        success: true,
        data: this._formatPayment(payment),
        message: `Multi-sig payment request created. ${authorizedSigners.length} signers notified.`,
      });
    } catch (err) {
      return this._handleError(res, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  GET /api/payments/multi-sig/:id
  // ─────────────────────────────────────────────────────────────────────────

  async getPaymentRequest(req, res) {
    try {
      const payment = await this.multiSigService.getPayment(req.params.id);
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment request not found' });
      }

      // Only authorised signers and the creator can view the request
      const callerKey = req.user?.publicKey;
      const isAuthorised =
        payment.created_by === callerKey ||
        payment.authorized_signers.includes(callerKey);

      if (!isAuthorised) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      return res.json({ success: true, data: this._formatPayment(payment, { includeXdr: true }) });
    } catch (err) {
      return this._handleError(res, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  POST /api/payments/multi-sig/:id/sign
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Submit a signature for a pending payment request.
   *
   * Body: { signedEnvelopeXdr: string }
   */
  async submitSignature(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { signedEnvelopeXdr } = req.body;
      const signerPublicKey = req.user?.publicKey ?? req.body.signerPublicKey;
      const ipAddress = req.ip ?? req.connection?.remoteAddress;

      const result = await this.multiSigService.submitSignature({
        paymentDbId: req.params.id,
        signerPublicKey,
        signedEnvelopeXdr,
        ipAddress,
      });

      const message = result.thresholdMet
        ? `Threshold met — transaction submitted to Stellar network (hash: ${result.stellarTxHash})`
        : `Signature accepted. ${result.payment.required_signatures - result.payment.collected_signatures_count} more signature(s) required.`;

      return res.json({
        success: true,
        data: this._formatPayment(result.payment),
        stellarTxHash: result.stellarTxHash ?? null,
        message,
      });
    } catch (err) {
      return this._handleError(res, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  POST /api/payments/multi-sig/:id/submit
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Manually submit a payment that has reached its threshold (status: ready).
   * Useful if auto-submit failed or was disabled.
   */
  async submitToNetwork(req, res) {
    try {
      const result = await this.multiSigService.submitToNetwork(req.params.id);

      return res.json({
        success: true,
        data: this._formatPayment(result.payment),
        stellarTxHash: result.stellarTxHash,
        message: `Transaction submitted successfully (hash: ${result.stellarTxHash})`,
      });
    } catch (err) {
      return this._handleError(res, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  GET /api/payments/multi-sig/pending?signer=G…
  // ─────────────────────────────────────────────────────────────────────────

  async listPendingForSigner(req, res) {
    try {
      const signerKey = req.query.signer ?? req.user?.publicKey;
      if (!signerKey) {
        return res.status(400).json({ success: false, message: 'signer query param required' });
      }

      const payments = await this.multiSigService.listPendingForSigner(signerKey);
      return res.json({
        success: true,
        data: payments.map((p) => this._formatPayment(p)),
        count: payments.length,
      });
    } catch (err) {
      return this._handleError(res, err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PRIVATE
  // ─────────────────────────────────────────────────────────────────────────

  _formatPayment(payment, { includeXdr = false } = {}) {
    const base = {
      id: payment.id,
      paymentId: payment.payment_id,
      sourceAccount: payment.source_account,
      destinationAccount: payment.destination_account,
      amount: payment.amount,
      asset: payment.asset_issuer
        ? `${payment.asset_code}:${payment.asset_issuer}`
        : payment.asset_code,
      memo: payment.memo,
      requiredSignatures: payment.required_signatures,
      collectedSignatures: payment.collected_signatures_count,
      remainingSignatures: Math.max(
        0,
        payment.required_signatures - payment.collected_signatures_count
      ),
      authorizedSigners: payment.authorized_signers,
      status: payment.status,
      expiresAt: payment.expires_at,
      thresholdMetAt: payment.threshold_met_at,
      submittedAt: payment.submitted_at,
      stellarTxHash: payment.stellar_tx_hash,
      createdAt: payment.created_at,
    };

    if (includeXdr) {
      base.unsignedXdr = payment.unsigned_xdr;
    }

    if (payment.signatures) {
      base.signatures = payment.signatures.map((s) => ({
        signerPublicKey: s.signer_public_key,
        signedAt: s.signed_at,
      }));
    }

    return base;
  }

  _handleError(res, err) {
    console.error('[MultiSigPaymentController]', err);

    const statusMap = {
      'not found': 404,
      forbidden: 403,
      'not an authorised signer': 403,
      'already signed': 409,
      'not accepting signatures': 422,
      'cannot be submitted': 422,
    };

    const msg = err.message?.toLowerCase() ?? '';
    const status = Object.entries(statusMap).find(([k]) => msg.includes(k))?.[1] ?? 500;

    return res.status(status).json({
      success: false,
      message: err.message ?? 'Internal server error',
    });
  }
}

module.exports = MultiSigPaymentController;
