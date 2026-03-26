'use strict';

/**
 * MultiSigService
 *
 * Orchestrates the full multi-signature payment lifecycle:
 *  1. Create a payment request + generate unsigned XDR
 *  2. Collect individual signer envelopes
 *  3. Merge signatures once threshold is met
 *  4. Submit the fully-signed transaction to Stellar
 *  5. Schedule 24-hour expiry via BullMQ
 *  6. Notify all authorised signers at each step
 */

const StellarSdk = require('@stellar/stellar-sdk');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');

// ─── Dependency injection ─────────────────────────────────────────────────────
// All heavy dependencies are passed in via the constructor so the service
// is fully testable without live DB / network connections.
class MultiSigService {
  /**
   * @param {object} deps
   * @param {object} deps.models              - Sequelize model map { MultiSigPayment, MultiSigSignature }
   * @param {object} deps.notificationService - Has `notify(userId, event, data)`
   * @param {object} deps.expiryQueue         - BullMQ Queue instance for delayed expiry jobs
   * @param {string} deps.stellarHorizonUrl   - e.g. 'https://horizon-testnet.stellar.org'
   * @param {string} [deps.networkPassphrase] - Stellar network passphrase
   */
  constructor({ models, notificationService, expiryQueue, stellarHorizonUrl, networkPassphrase }) {
    this.MultiSigPayment = models.MultiSigPayment;
    this.MultiSigSignature = models.MultiSigSignature;
    this.notificationService = notificationService;
    this.expiryQueue = expiryQueue;
    this.server = new StellarSdk.Horizon.Server(stellarHorizonUrl);
    this.networkPassphrase =
      networkPassphrase ?? StellarSdk.Networks.TESTNET;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  1. CREATE PAYMENT REQUEST
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new multi-sig payment request.
   *
   * @param {object} params
   * @param {string}   params.sourceAccount        - Stellar source account (G…)
   * @param {string}   params.destinationAccount   - Stellar destination account (G…)
   * @param {string}   params.amount               - Amount as string (e.g. "100.00")
   * @param {string}   [params.assetCode='XLM']    - Asset code
   * @param {string}   [params.assetIssuer]        - Asset issuer (required for non-XLM)
   * @param {string}   [params.memo]               - Optional memo text (≤28 chars)
   * @param {number}   params.requiredSignatures   - Threshold (e.g. 2 for 2-of-3)
   * @param {string[]} params.authorizedSigners    - Array of G… public keys allowed to sign
   * @param {string}   params.createdBy            - Public key of the initiating admin
   * @returns {Promise<object>} The created MultiSigPayment record
   */
  async createPaymentRequest({
    sourceAccount,
    destinationAccount,
    amount,
    assetCode = 'XLM',
    assetIssuer = null,
    memo = null,
    requiredSignatures,
    authorizedSigners,
    createdBy,
  }) {
    // ── Validation ────────────────────────────────────────────────────────
    this._validateStellarPublicKey(sourceAccount, 'sourceAccount');
    this._validateStellarPublicKey(destinationAccount, 'destinationAccount');
    this._validateSignerConfig(requiredSignatures, authorizedSigners);

    if (assetCode !== 'XLM' && !assetIssuer) {
      throw new Error(`assetIssuer is required for non-XLM asset "${assetCode}"`);
    }
    if (memo && memo.length > 28) {
      throw new Error('memo must be 28 characters or fewer');
    }

    // ── Build unsigned XDR ────────────────────────────────────────────────
    const unsignedXdr = await this.buildUnsignedXdr({
      sourceAccount,
      destinationAccount,
      amount,
      assetCode,
      assetIssuer,
      memo,
    });

    // ── Persist ───────────────────────────────────────────────────────────
    const paymentId = this._generatePaymentId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24 h

    const payment = await this.MultiSigPayment.create({
      id: uuidv4(),
      payment_id: paymentId,
      source_account: sourceAccount,
      destination_account: destinationAccount,
      amount,
      asset_code: assetCode,
      asset_issuer: assetIssuer,
      memo,
      required_signatures: requiredSignatures,
      collected_signatures_count: 0,
      authorized_signers: authorizedSigners,
      unsigned_xdr: unsignedXdr,
      status: 'pending',
      created_by: createdBy,
      expires_at: expiresAt,
    });

    // ── Schedule expiry job ───────────────────────────────────────────────
    const expiryJob = await this.expiryQueue.add(
      'expire-multisig-payment',
      { paymentId: payment.id },
      { delay: 24 * 60 * 60 * 1000, jobId: `expire-${payment.id}` }
    );

    await payment.update({ expiry_job_id: expiryJob.id });

    // ── Notify all authorised signers ─────────────────────────────────────
    await this._notifyAll(authorizedSigners, 'MULTISIG_PAYMENT_CREATED', {
      paymentId: payment.payment_id,
      amount,
      assetCode,
      destinationAccount,
      requiredSignatures,
      totalSigners: authorizedSigners.length,
      expiresAt,
    });

    return payment;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  2. BUILD UNSIGNED XDR (reusable / exported method)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fetch the source account sequence number from Horizon and build an
   * unsigned TransactionEnvelope XDR string.
   *
   * This method is intentionally public so PaymentService.js can reuse it.
   */
  async buildUnsignedXdr({
    sourceAccount,
    destinationAccount,
    amount,
    assetCode = 'XLM',
    assetIssuer = null,
    memo = null,
  }) {
    const accountResponse = await this.server.loadAccount(sourceAccount);

    const asset =
      assetCode === 'XLM'
        ? StellarSdk.Asset.native()
        : new StellarSdk.Asset(assetCode, assetIssuer);

    const txBuilder = new StellarSdk.TransactionBuilder(accountResponse, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    });

    txBuilder.addOperation(
      StellarSdk.Operation.payment({
        destination: destinationAccount,
        asset,
        amount: String(amount),
      })
    );

    if (memo) {
      txBuilder.addMemo(StellarSdk.Memo.text(memo));
    }

    // 5-minute time bound — signers must sign before this inner deadline.
    // The outer 24-hour window is enforced by our application logic.
    txBuilder.setTimeout(300);

    const tx = txBuilder.build();
    return tx.toEnvelope().toXDR('base64');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  3. SUBMIT SIGNATURE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Accept a signed XDR envelope from a signer, verify it, persist the
   * signature, and auto-submit when the threshold is reached.
   *
   * @param {string} paymentDbId   - MultiSigPayment.id (UUID)
   * @param {string} signerPublicKey - G… public key of the signer
   * @param {string} signedEnvelopeXdr - Base64 XDR of the signed transaction
   * @param {string} [ipAddress]   - Caller IP for audit log
   * @returns {Promise<object>} Updated payment + metadata
   */
  async submitSignature({ paymentDbId, signerPublicKey, signedEnvelopeXdr, ipAddress = null }) {
    const payment = await this._loadPaymentOrThrow(paymentDbId);

    // ── Guard checks ──────────────────────────────────────────────────────
    if (!payment.isAcceptingSignatures) {
      throw new Error(
        `Payment "${payment.payment_id}" is not accepting signatures (status: ${payment.status})`
      );
    }
    if (!payment.authorized_signers.includes(signerPublicKey)) {
      throw new Error(`Public key ${signerPublicKey} is not an authorised signer for this payment`);
    }

    // Check for duplicate signature
    const existing = await this.MultiSigSignature.findOne({
      where: {
        multi_sig_payment_id: paymentDbId,
        signer_public_key: signerPublicKey,
      },
    });
    if (existing) {
      throw new Error(`Signer ${signerPublicKey} has already signed this payment`);
    }

    // ── Cryptographic verification ────────────────────────────────────────
    const { signature, hint } = this._extractSignature(
      payment.unsigned_xdr,
      signedEnvelopeXdr,
      signerPublicKey
    );

    // ── Persist signature ─────────────────────────────────────────────────
    await this.MultiSigSignature.create({
      id: uuidv4(),
      multi_sig_payment_id: paymentDbId,
      signer_public_key: signerPublicKey,
      signature: signature.toString('hex'),
      signed_envelope_xdr: signedEnvelopeXdr,
      signed_at: new Date(),
      ip_address: ipAddress,
    });

    const newCount = payment.collected_signatures_count + 1;
    await payment.update({ collected_signatures_count: newCount });

    // ── Notify all signers of the new signature ───────────────────────────
    await this._notifyAll(payment.authorized_signers, 'MULTISIG_SIGNATURE_ADDED', {
      paymentId: payment.payment_id,
      signerPublicKey,
      collectedCount: newCount,
      requiredCount: payment.required_signatures,
      remainingCount: Math.max(0, payment.required_signatures - newCount),
    });

    // ── Auto-submit when threshold met ────────────────────────────────────
    if (newCount >= payment.required_signatures) {
      await payment.update({ status: 'ready', threshold_met_at: new Date() });
      return this._assembleAndSubmit(payment);
    }

    await payment.reload();
    return { payment, thresholdMet: false };
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  4. MANUAL SUBMIT (if auto-submit was skipped)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Manually trigger submission for a payment that has reached its threshold
   * but has not yet been submitted (e.g. status === 'ready').
   */
  async submitToNetwork(paymentDbId) {
    const payment = await this._loadPaymentOrThrow(paymentDbId);

    if (payment.status !== 'ready') {
      throw new Error(
        `Payment "${payment.payment_id}" cannot be submitted (status: ${payment.status})`
      );
    }

    return this._assembleAndSubmit(payment);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  5. GET PAYMENT DETAILS
  // ─────────────────────────────────────────────────────────────────────────

  async getPayment(paymentDbId) {
    return this.MultiSigPayment.findByPk(paymentDbId, {
      include: [
        {
          association: 'signatures',
          attributes: ['id', 'signer_public_key', 'signed_at', 'ip_address'],
        },
      ],
    });
  }

  async listPendingForSigner(signerPublicKey) {
    // JSON_CONTAINS is MySQL syntax; for PostgreSQL use JSON array operators
    const payments = await this.MultiSigPayment.findAll({
      where: {
        status: 'pending',
        expires_at: { [Op.gt]: new Date() },
      },
      include: [{ association: 'signatures', attributes: ['signer_public_key'] }],
    });

    // Filter those that include this signer in authorized_signers but haven't
    // yet signed (application-level filter — avoids dialect-specific JSON queries)
    return payments.filter(
      (p) =>
        p.authorized_signers.includes(signerPublicKey) &&
        !p.signatures.some((s) => s.signer_public_key === signerPublicKey)
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  6. EXPIRE PAYMENT (called by BullMQ worker)
  // ─────────────────────────────────────────────────────────────────────────

  async expirePayment(paymentDbId) {
    const payment = await this._loadPaymentOrThrow(paymentDbId);

    if (payment.status !== 'pending') {
      // Already submitted or expired — nothing to do
      return null;
    }

    await payment.update({ status: 'expired' });

    await this._notifyAll(payment.authorized_signers, 'MULTISIG_PAYMENT_EXPIRED', {
      paymentId: payment.payment_id,
      collectedCount: payment.collected_signatures_count,
      requiredCount: payment.required_signatures,
      expiredAt: new Date(),
    });

    return payment;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Merge all collected DecoratedSignatures onto the base unsigned XDR and
   * submit the fully-signed envelope to Stellar Horizon.
   */
  async _assembleAndSubmit(payment) {
    // Load all collected signatures
    const signatures = await this.MultiSigSignature.findAll({
      where: { multi_sig_payment_id: payment.id },
      order: [['signed_at', 'ASC']],
    });

    // Reconstruct the base transaction from unsigned XDR
    const baseTx = new StellarSdk.Transaction(
      payment.unsigned_xdr,
      this.networkPassphrase
    );

    // Merge each signer's DecoratedSignature into the base transaction
    for (const sig of signatures) {
      const signerXdr = sig.signed_envelope_xdr;
      const signedTx = new StellarSdk.Transaction(signerXdr, this.networkPassphrase);

      // Find the DecoratedSignature that belongs to this signer
      const keypair = StellarSdk.Keypair.fromPublicKey(sig.signer_public_key);
      const decoratedSig = signedTx.signatures.find(
        (ds) => ds.hint().toString('hex') === keypair.signatureHint().toString('hex')
      );

      if (!decoratedSig) {
        throw new Error(
          `Could not find signature for ${sig.signer_public_key} in stored XDR`
        );
      }

      baseTx.signatures.push(decoratedSig);
    }

    const signedXdr = baseTx.toEnvelope().toXDR('base64');
    await payment.update({ signed_xdr: signedXdr });

    // ── Submit to Horizon ─────────────────────────────────────────────────
    let txResult;
    try {
      txResult = await this.server.submitTransaction(baseTx);
    } catch (err) {
      const reason = this._extractHorizonError(err);
      await payment.update({ status: 'failed', failure_reason: reason });

      await this._notifyAll(payment.authorized_signers, 'MULTISIG_PAYMENT_FAILED', {
        paymentId: payment.payment_id,
        reason,
      });

      throw new Error(`Stellar submission failed: ${reason}`);
    }

    // ── Update record ─────────────────────────────────────────────────────
    await payment.update({
      status: 'submitted',
      stellar_tx_hash: txResult.hash,
      submitted_at: new Date(),
    });

    // ── Cancel expiry job ─────────────────────────────────────────────────
    if (payment.expiry_job_id) {
      try {
        const job = await this.expiryQueue.getJob(payment.expiry_job_id);
        if (job) await job.remove();
      } catch {
        // Non-fatal — job may have already run or been cleaned up
      }
    }

    // ── Notify everyone ───────────────────────────────────────────────────
    await this._notifyAll(payment.authorized_signers, 'MULTISIG_PAYMENT_SUBMITTED', {
      paymentId: payment.payment_id,
      stellarTxHash: txResult.hash,
      amount: payment.amount,
      assetCode: payment.asset_code,
      destinationAccount: payment.destination_account,
      submittedAt: new Date(),
    });

    await payment.reload({ include: [{ association: 'signatures' }] });
    return { payment, stellarTxHash: txResult.hash, thresholdMet: true };
  }

  /**
   * Parse a signed XDR envelope and extract the DecoratedSignature that
   * belongs to `signerPublicKey`, verifying it cryptographically.
   *
   * @returns {{ signature: Buffer, hint: Buffer }}
   */
  _extractSignature(unsignedXdr, signedEnvelopeXdr, signerPublicKey) {
    // Decode both envelopes
    const baseTx = new StellarSdk.Transaction(unsignedXdr, this.networkPassphrase);
    const signedTx = new StellarSdk.Transaction(signedEnvelopeXdr, this.networkPassphrase);

    // The signed envelope must wrap exactly the same transaction hash
    if (baseTx.hash().toString('hex') !== signedTx.hash().toString('hex')) {
      throw new Error('Signed XDR does not match the payment transaction');
    }

    const keypair = StellarSdk.Keypair.fromPublicKey(signerPublicKey);
    const expectedHint = keypair.signatureHint().toString('hex');

    const decoratedSig = signedTx.signatures.find(
      (ds) => ds.hint().toString('hex') === expectedHint
    );

    if (!decoratedSig) {
      throw new Error(`No signature found for public key ${signerPublicKey} in submitted XDR`);
    }

    // Verify the signature cryptographically
    const txHash = baseTx.hash();
    const isValid = keypair.verify(txHash, decoratedSig.signature());

    if (!isValid) {
      throw new Error(`Signature verification failed for public key ${signerPublicKey}`);
    }

    return {
      signature: Buffer.from(decoratedSig.signature()),
      hint: Buffer.from(decoratedSig.hint()),
    };
  }

  async _loadPaymentOrThrow(paymentDbId) {
    const payment = await this.MultiSigPayment.findByPk(paymentDbId);
    if (!payment) {
      throw new Error(`MultiSigPayment not found: ${paymentDbId}`);
    }
    return payment;
  }

  async _notifyAll(signerPublicKeys, event, data) {
    const notifications = signerPublicKeys.map((key) =>
      this.notificationService
        .notify(key, event, data)
        .catch((err) =>
          console.error(`Notification failed for ${key} (${event}):`, err.message)
        )
    );
    await Promise.allSettled(notifications);
  }

  _validateStellarPublicKey(key, fieldName) {
    try {
      StellarSdk.Keypair.fromPublicKey(key);
    } catch {
      throw new Error(`Invalid Stellar public key for field "${fieldName}": ${key}`);
    }
  }

  _validateSignerConfig(required, signers) {
    if (!Array.isArray(signers) || signers.length < 2) {
      throw new Error('authorizedSigners must contain at least 2 public keys');
    }
    if (required < 2) {
      throw new Error('requiredSignatures must be at least 2');
    }
    if (required > signers.length) {
      throw new Error(
        `requiredSignatures (${required}) cannot exceed total signers (${signers.length})`
      );
    }
    // Validate each key
    signers.forEach((key, i) => this._validateStellarPublicKey(key, `authorizedSigners[${i}]`));
    // Check for duplicates
    if (new Set(signers).size !== signers.length) {
      throw new Error('authorizedSigners must not contain duplicate public keys');
    }
  }

  _generatePaymentId() {
    const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `PAY-${ts}-${rand}`;
  }

  _extractHorizonError(err) {
    try {
      const result = err?.response?.data?.extras?.result_codes;
      if (result) return JSON.stringify(result);
    } catch {
      // fall through
    }
    return err.message ?? 'Unknown Stellar error';
  }
}

module.exports = MultiSigService;
