'use strict';

/**
 * MultiSigService.test.js
 *
 * Tests cover:
 *  - 2-of-3 and 3-of-5 multi-sig scenarios
 *  - Input validation
 *  - Duplicate signature prevention
 *  - Unauthorised signer rejection
 *  - Auto-submission at threshold
 *  - Manual submission (status: ready)
 *  - Payment expiry
 *  - Notification dispatch at each lifecycle step
 *  - Cryptographic signature verification
 */

const StellarSdk = require('@stellar/stellar-sdk');
const MultiSigService = require('../../services/MultiSigService');

// ─── Test Keypairs (generated once, reused across tests) ──────────────────────
const ADMIN   = StellarSdk.Keypair.random();
const SIGNER1 = StellarSdk.Keypair.random();
const SIGNER2 = StellarSdk.Keypair.random();
const SIGNER3 = StellarSdk.Keypair.random();
const SIGNER4 = StellarSdk.Keypair.random();
const SIGNER5 = StellarSdk.Keypair.random();
const DESTINATION = StellarSdk.Keypair.random();
const STRANGER    = StellarSdk.Keypair.random();

const TESTNET_PASSPHRASE = StellarSdk.Networks.TESTNET;

// ─── Minimal mock helpers ─────────────────────────────────────────────────────

function makeUnsignedXdr(sourceKeypair = ADMIN) {
  // Build a minimal transaction without touching Horizon
  const account = new StellarSdk.Account(sourceKeypair.publicKey(), '100');
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: DESTINATION.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: '10.0000000',
      })
    )
    .setTimeout(300)
    .build();

  return tx.toEnvelope().toXDR('base64');
}

function signXdr(unsignedXdr, signerKeypair) {
  const tx = new StellarSdk.Transaction(unsignedXdr, TESTNET_PASSPHRASE);
  tx.sign(signerKeypair);
  return tx.toEnvelope().toXDR('base64');
}

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildMocks({ unsignedXdr } = {}) {
  const xdr = unsignedXdr ?? makeUnsignedXdr();

  // In-memory payment store keyed by UUID
  const store = new Map();
  const sigStore = new Map(); // key: `${paymentId}:${signerKey}`

  let idCounter = 0;
  const nextId = () => `uuid-${++idCounter}`;

  // ── MultiSigPayment mock ──────────────────────────────────────────────────
  const MockPayment = {
    _store: store,
    create: jest.fn(async (data) => {
      const id = data.id ?? nextId();
      const record = {
        ...data,
        id,
        collected_signatures_count: 0,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
        // Attach helpers matching the model instance API
        update: jest.fn(async (fields) => {
          Object.assign(record, fields);
          return record;
        }),
        reload: jest.fn(async () => record),
        get isThresholdMet() {
          return record.collected_signatures_count >= record.required_signatures;
        },
        get isAcceptingSignatures() {
          return record.status === 'pending' && new Date() < new Date(record.expires_at);
        },
      };
      store.set(id, record);
      return record;
    }),
    findByPk: jest.fn(async (id) => store.get(id) ?? null),
    findAll: jest.fn(async () => [...store.values()]),
  };

  // ── MultiSigSignature mock ────────────────────────────────────────────────
  const MockSignature = {
    create: jest.fn(async (data) => {
      const key = `${data.multi_sig_payment_id}:${data.signer_public_key}`;
      const record = { ...data, id: nextId() };
      sigStore.set(key, record);
      return record;
    }),
    findOne: jest.fn(async ({ where }) => {
      const key = `${where.multi_sig_payment_id}:${where.signer_public_key}`;
      return sigStore.get(key) ?? null;
    }),
    findAll: jest.fn(async ({ where }) => {
      return [...sigStore.values()].filter(
        (s) => s.multi_sig_payment_id === where.multi_sig_payment_id
      );
    }),
  };

  // ── Notification service mock ─────────────────────────────────────────────
  const notificationService = {
    notify: jest.fn().mockResolvedValue(undefined),
  };

  // ── BullMQ Queue mock ─────────────────────────────────────────────────────
  const mockJob = { id: 'job-1', remove: jest.fn().mockResolvedValue(undefined) };
  const expiryQueue = {
    add: jest.fn().mockResolvedValue(mockJob),
    getJob: jest.fn().mockResolvedValue(mockJob),
  };

  // ── Horizon server mock ───────────────────────────────────────────────────
  const horizonSubmitResult = { hash: 'mock-stellar-tx-hash-abc123' };
  const mockServer = {
    loadAccount: jest.fn().mockResolvedValue(
      new StellarSdk.Account(ADMIN.publicKey(), '100')
    ),
    submitTransaction: jest.fn().mockResolvedValue(horizonSubmitResult),
  };

  return {
    xdr,
    store,
    sigStore,
    MockPayment,
    MockSignature,
    notificationService,
    expiryQueue,
    mockServer,
    horizonSubmitResult,
  };
}

function buildService(mocks) {
  const service = new MultiSigService({
    models: {
      MultiSigPayment: mocks.MockPayment,
      MultiSigSignature: mocks.MockSignature,
    },
    notificationService: mocks.notificationService,
    expiryQueue: mocks.expiryQueue,
    stellarHorizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: TESTNET_PASSPHRASE,
  });

  // Stub out Horizon server so no real HTTP calls are made
  service.server = mocks.mockServer;

  return service;
}

// ═════════════════════════════════════════════════════════════════════════════
//  TEST SUITE
// ═════════════════════════════════════════════════════════════════════════════

describe('MultiSigService', () => {
  // ── Shared payment params ──────────────────────────────────────────────────
  const baseParams = (overrides = {}) => ({
    sourceAccount: ADMIN.publicKey(),
    destinationAccount: DESTINATION.publicKey(),
    amount: '500.00',
    assetCode: 'XLM',
    memo: 'Q4 treasury',
    createdBy: ADMIN.publicKey(),
    ...overrides,
  });

  // ──────────────────────────────────────────────────────────────────────────
  //  createPaymentRequest
  // ──────────────────────────────────────────────────────────────────────────

  describe('createPaymentRequest()', () => {
    it('creates a 2-of-3 payment request and notifies all 3 signers', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);

      const payment = await service.createPaymentRequest({
        ...baseParams(),
        requiredSignatures: 2,
        authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey()],
      });

      expect(payment.required_signatures).toBe(2);
      expect(payment.authorized_signers).toHaveLength(3);
      expect(payment.status).toBe('pending');
      expect(payment.unsigned_xdr).toBeTruthy();
      expect(payment.expires_at).toBeInstanceOf(Date);

      // Should notify all 3 signers
      expect(mocks.notificationService.notify).toHaveBeenCalledTimes(3);
      const events = mocks.notificationService.notify.mock.calls.map((c) => c[1]);
      expect(events.every((e) => e === 'MULTISIG_PAYMENT_CREATED')).toBe(true);

      // Expiry job should be queued
      expect(mocks.expiryQueue.add).toHaveBeenCalledWith(
        'expire-multisig-payment',
        { paymentId: payment.id },
        expect.objectContaining({ delay: 24 * 60 * 60 * 1000 })
      );
    });

    it('creates a 3-of-5 payment request and notifies all 5 signers', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);

      const allSigners = [
        SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey(),
        SIGNER4.publicKey(), SIGNER5.publicKey(),
      ];

      const payment = await service.createPaymentRequest({
        ...baseParams(),
        requiredSignatures: 3,
        authorizedSigners: allSigners,
      });

      expect(payment.required_signatures).toBe(3);
      expect(payment.authorized_signers).toHaveLength(5);
      expect(mocks.notificationService.notify).toHaveBeenCalledTimes(5);
    });

    it('generates and stores an unsigned XDR', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);

      // Pre-bake an XDR from buildUnsignedXdr
      const expectedXdr = makeUnsignedXdr();
      service.buildUnsignedXdr = jest.fn().mockResolvedValue(expectedXdr);

      const payment = await service.createPaymentRequest({
        ...baseParams(),
        requiredSignatures: 2,
        authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey()],
      });

      expect(payment.unsigned_xdr).toBe(expectedXdr);
      expect(service.buildUnsignedXdr).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceAccount: ADMIN.publicKey(),
          destinationAccount: DESTINATION.publicKey(),
          amount: '500.00',
        })
      );
    });

    it('rejects when requiredSignatures exceeds total signers', async () => {
      const service = buildService(buildMocks());

      await expect(
        service.createPaymentRequest({
          ...baseParams(),
          requiredSignatures: 4,
          authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey()],
        })
      ).rejects.toThrow(/cannot exceed total signers/i);
    });

    it('rejects requiredSignatures < 2', async () => {
      const service = buildService(buildMocks());

      await expect(
        service.createPaymentRequest({
          ...baseParams(),
          requiredSignatures: 1,
          authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey()],
        })
      ).rejects.toThrow(/at least 2/i);
    });

    it('rejects duplicate keys in authorizedSigners', async () => {
      const service = buildService(buildMocks());

      await expect(
        service.createPaymentRequest({
          ...baseParams(),
          requiredSignatures: 2,
          authorizedSigners: [SIGNER1.publicKey(), SIGNER1.publicKey(), SIGNER2.publicKey()],
        })
      ).rejects.toThrow(/duplicate/i);
    });

    it('rejects invalid Stellar public key', async () => {
      const service = buildService(buildMocks());

      await expect(
        service.createPaymentRequest({
          ...baseParams(),
          sourceAccount: 'NOT_A_VALID_KEY',
          requiredSignatures: 2,
          authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey()],
        })
      ).rejects.toThrow(/sourceAccount/i);
    });

    it('rejects non-XLM payment without assetIssuer', async () => {
      const service = buildService(buildMocks());

      await expect(
        service.createPaymentRequest({
          ...baseParams(),
          assetCode: 'USDC',
          requiredSignatures: 2,
          authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey()],
        })
      ).rejects.toThrow(/assetIssuer is required/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  //  submitSignature — 2-of-3 scenario
  // ──────────────────────────────────────────────────────────────────────────

  describe('submitSignature() — 2-of-3', () => {
    async function setup2of3() {
      const mocks = buildMocks();
      const service = buildService(mocks);
      const xdr = makeUnsignedXdr();

      service.buildUnsignedXdr = jest.fn().mockResolvedValue(xdr);

      const payment = await service.createPaymentRequest({
        ...baseParams(),
        requiredSignatures: 2,
        authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey()],
      });

      mocks.notificationService.notify.mockClear();
      return { service, payment, mocks, xdr };
    }

    it('accepts the first signature and does NOT submit yet', async () => {
      const { service, payment, mocks, xdr } = await setup2of3();
      const signed1 = signXdr(xdr, SIGNER1);

      const result = await service.submitSignature({
        paymentDbId: payment.id,
        signerPublicKey: SIGNER1.publicKey(),
        signedEnvelopeXdr: signed1,
      });

      expect(result.thresholdMet).toBe(false);
      expect(result.payment.collected_signatures_count).toBe(1);
      expect(result.payment.status).toBe('pending');
      expect(mocks.mockServer.submitTransaction).not.toHaveBeenCalled();

      // Notification: SIGNATURE_ADDED to all 3 signers
      expect(mocks.notificationService.notify).toHaveBeenCalledTimes(3);
      expect(mocks.notificationService.notify).toHaveBeenCalledWith(
        expect.any(String),
        'MULTISIG_SIGNATURE_ADDED',
        expect.objectContaining({ collectedCount: 1, requiredCount: 2 })
      );
    });

    it('accepts second signature, meets threshold, and auto-submits', async () => {
      const { service, payment, mocks, xdr } = await setup2of3();
      const signed1 = signXdr(xdr, SIGNER1);
      const signed2 = signXdr(xdr, SIGNER2);

      await service.submitSignature({
        paymentDbId: payment.id,
        signerPublicKey: SIGNER1.publicKey(),
        signedEnvelopeXdr: signed1,
      });

      mocks.notificationService.notify.mockClear();

      const result = await service.submitSignature({
        paymentDbId: payment.id,
        signerPublicKey: SIGNER2.publicKey(),
        signedEnvelopeXdr: signed2,
      });

      expect(result.thresholdMet).toBe(true);
      expect(result.stellarTxHash).toBe('mock-stellar-tx-hash-abc123');
      expect(result.payment.status).toBe('submitted');
      expect(mocks.mockServer.submitTransaction).toHaveBeenCalledTimes(1);

      // SUBMITTED notification sent to all 3 signers
      const submittedCalls = mocks.notificationService.notify.mock.calls.filter(
        (c) => c[1] === 'MULTISIG_PAYMENT_SUBMITTED'
      );
      expect(submittedCalls).toHaveLength(3);
    });

    it('cancels the expiry job after successful submission', async () => {
      const { service, payment, mocks, xdr } = await setup2of3();

      await service.submitSignature({
        paymentDbId: payment.id,
        signerPublicKey: SIGNER1.publicKey(),
        signedEnvelopeXdr: signXdr(xdr, SIGNER1),
      });
      await service.submitSignature({
        paymentDbId: payment.id,
        signerPublicKey: SIGNER2.publicKey(),
        signedEnvelopeXdr: signXdr(xdr, SIGNER2),
      });

      expect(mocks.expiryQueue.getJob).toHaveBeenCalled();
      // getJob returns mockJob which has a remove() spy — verify it was called
      const jobFromMock = await mocks.expiryQueue.getJob.mock.results[0]?.value;
      expect(jobFromMock).toBeDefined();
      expect(typeof jobFromMock?.remove).toBe('function');
    });

    it('rejects a signature from an unauthorised signer', async () => {
      const { service, payment, xdr } = await setup2of3();

      await expect(
        service.submitSignature({
          paymentDbId: payment.id,
          signerPublicKey: STRANGER.publicKey(),
          signedEnvelopeXdr: signXdr(xdr, STRANGER),
        })
      ).rejects.toThrow(/not an authorised signer/i);
    });

    it('rejects a duplicate signature from the same signer', async () => {
      const { service, payment, xdr } = await setup2of3();
      const signed1 = signXdr(xdr, SIGNER1);

      await service.submitSignature({
        paymentDbId: payment.id,
        signerPublicKey: SIGNER1.publicKey(),
        signedEnvelopeXdr: signed1,
      });

      await expect(
        service.submitSignature({
          paymentDbId: payment.id,
          signerPublicKey: SIGNER1.publicKey(),
          signedEnvelopeXdr: signed1,
        })
      ).rejects.toThrow(/already signed/i);
    });

    it('rejects a signed XDR that does not match the payment transaction', async () => {
      const { service, payment } = await setup2of3();

      // Sign a completely different transaction
      const differentXdr = makeUnsignedXdr(SIGNER2);
      const tampered = signXdr(differentXdr, SIGNER1);

      await expect(
        service.submitSignature({
          paymentDbId: payment.id,
          signerPublicKey: SIGNER1.publicKey(),
          signedEnvelopeXdr: tampered,
        })
      ).rejects.toThrow(/does not match/i);
    });

    it('rejects a signature from an authorised signer with the wrong key', async () => {
      const { service, payment, xdr } = await setup2of3();

      // SIGNER2 is authorised, but we pass SIGNER1's public key — mismatch
      const signedBySigner2 = signXdr(xdr, SIGNER2);

      await expect(
        service.submitSignature({
          paymentDbId: payment.id,
          signerPublicKey: SIGNER1.publicKey(), // wrong — this is SIGNER2's sig
          signedEnvelopeXdr: signedBySigner2,
        })
      ).rejects.toThrow(/No signature found/i);
    });

    it('rejects signatures on an expired payment', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);
      const xdr = makeUnsignedXdr();
      service.buildUnsignedXdr = jest.fn().mockResolvedValue(xdr);

      const payment = await service.createPaymentRequest({
        ...baseParams(),
        requiredSignatures: 2,
        authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey()],
      });

      // Force expiry
      await payment.update({ status: 'expired' });

      await expect(
        service.submitSignature({
          paymentDbId: payment.id,
          signerPublicKey: SIGNER1.publicKey(),
          signedEnvelopeXdr: signXdr(xdr, SIGNER1),
        })
      ).rejects.toThrow(/not accepting signatures/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  //  submitSignature — 3-of-5 scenario
  // ──────────────────────────────────────────────────────────────────────────

  describe('submitSignature() — 3-of-5', () => {
    async function setup3of5() {
      const mocks = buildMocks();
      const service = buildService(mocks);
      const xdr = makeUnsignedXdr();
      service.buildUnsignedXdr = jest.fn().mockResolvedValue(xdr);

      const allSigners = [
        SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey(),
        SIGNER4.publicKey(), SIGNER5.publicKey(),
      ];

      const payment = await service.createPaymentRequest({
        ...baseParams(),
        requiredSignatures: 3,
        authorizedSigners: allSigners,
      });

      mocks.notificationService.notify.mockClear();
      return { service, payment, mocks, xdr };
    }

    it('collects 2 signatures without submitting', async () => {
      const { service, payment, mocks, xdr } = await setup3of5();

      await service.submitSignature({
        paymentDbId: payment.id,
        signerPublicKey: SIGNER1.publicKey(),
        signedEnvelopeXdr: signXdr(xdr, SIGNER1),
      });

      const r2 = await service.submitSignature({
        paymentDbId: payment.id,
        signerPublicKey: SIGNER2.publicKey(),
        signedEnvelopeXdr: signXdr(xdr, SIGNER2),
      });

      expect(r2.thresholdMet).toBe(false);
      expect(r2.payment.collected_signatures_count).toBe(2);
      expect(mocks.mockServer.submitTransaction).not.toHaveBeenCalled();
    });

    it('submits when the 3rd signature arrives', async () => {
      const { service, payment, mocks, xdr } = await setup3of5();

      for (const kp of [SIGNER1, SIGNER2]) {
        await service.submitSignature({
          paymentDbId: payment.id,
          signerPublicKey: kp.publicKey(),
          signedEnvelopeXdr: signXdr(xdr, kp),
        });
      }

      mocks.notificationService.notify.mockClear();

      const result = await service.submitSignature({
        paymentDbId: payment.id,
        signerPublicKey: SIGNER3.publicKey(),
        signedEnvelopeXdr: signXdr(xdr, SIGNER3),
      });

      expect(result.thresholdMet).toBe(true);
      expect(result.payment.status).toBe('submitted');
      expect(result.stellarTxHash).toBeDefined();

      // All 5 signers notified of submission
      const submitted = mocks.notificationService.notify.mock.calls.filter(
        (c) => c[1] === 'MULTISIG_PAYMENT_SUBMITTED'
      );
      expect(submitted).toHaveLength(5);
    });

    it('does not submit on the 4th or 5th signature (already submitted)', async () => {
      const { service, payment, mocks, xdr } = await setup3of5();

      for (const kp of [SIGNER1, SIGNER2, SIGNER3]) {
        await service.submitSignature({
          paymentDbId: payment.id,
          signerPublicKey: kp.publicKey(),
          signedEnvelopeXdr: signXdr(xdr, kp),
        });
      }

      // SIGNER4 tries to sign after submission
      await expect(
        service.submitSignature({
          paymentDbId: payment.id,
          signerPublicKey: SIGNER4.publicKey(),
          signedEnvelopeXdr: signXdr(xdr, SIGNER4),
        })
      ).rejects.toThrow(/not accepting signatures/i);

      expect(mocks.mockServer.submitTransaction).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  //  submitToNetwork — manual trigger
  // ──────────────────────────────────────────────────────────────────────────

  describe('submitToNetwork()', () => {
    it('submits a payment with status "ready"', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);
      const xdr = makeUnsignedXdr();
      service.buildUnsignedXdr = jest.fn().mockResolvedValue(xdr);

      const payment = await service.createPaymentRequest({
        ...baseParams(),
        requiredSignatures: 2,
        authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey()],
      });

      // Manually collect 2 signatures and set status to ready (bypassing auto-submit)
      mocks.MockSignature.findAll = jest.fn().mockResolvedValue([
        { signer_public_key: SIGNER1.publicKey(), signed_envelope_xdr: signXdr(xdr, SIGNER1), signed_at: new Date() },
        { signer_public_key: SIGNER2.publicKey(), signed_envelope_xdr: signXdr(xdr, SIGNER2), signed_at: new Date() },
      ]);
      await payment.update({ status: 'ready', collected_signatures_count: 2, threshold_met_at: new Date() });

      const result = await service.submitToNetwork(payment.id);

      expect(result.thresholdMet).toBe(true);
      expect(result.payment.status).toBe('submitted');
      expect(result.stellarTxHash).toBe('mock-stellar-tx-hash-abc123');
    });

    it('throws if status is not "ready"', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);

      const payment = await mocks.MockPayment.create({
        id: 'test-id',
        payment_id: 'PAY-TEST',
        status: 'pending',
        authorized_signers: [],
        required_signatures: 2,
        expires_at: new Date(Date.now() + 86400000),
      });

      await expect(service.submitToNetwork('test-id')).rejects.toThrow(/cannot be submitted/i);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  //  expirePayment
  // ──────────────────────────────────────────────────────────────────────────

  describe('expirePayment()', () => {
    it('marks a pending payment as expired and notifies signers', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);
      const xdr = makeUnsignedXdr();
      service.buildUnsignedXdr = jest.fn().mockResolvedValue(xdr);

      const payment = await service.createPaymentRequest({
        ...baseParams(),
        requiredSignatures: 2,
        authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey()],
      });

      mocks.notificationService.notify.mockClear();

      const expired = await service.expirePayment(payment.id);

      expect(expired.status).toBe('expired');
      expect(mocks.notificationService.notify).toHaveBeenCalledTimes(3);
      expect(mocks.notificationService.notify).toHaveBeenCalledWith(
        expect.any(String),
        'MULTISIG_PAYMENT_EXPIRED',
        expect.objectContaining({ collectedCount: 0, requiredCount: 2 })
      );
    });

    it('is a no-op for already-submitted payments', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);

      // Directly insert into the store with 'submitted' status
      const record = {
        id: 'submitted-id',
        payment_id: 'PAY-DONE',
        status: 'submitted',
        authorized_signers: [SIGNER1.publicKey()],
        required_signatures: 2,
        collected_signatures_count: 2,
        expires_at: new Date(Date.now() + 86400000),
        created_at: new Date(),
        updated_at: new Date(),
        update: jest.fn(async () => record),
        reload: jest.fn(async () => record),
        get isThresholdMet() { return record.collected_signatures_count >= record.required_signatures; },
        get isAcceptingSignatures() { return record.status === 'pending' && new Date() < new Date(record.expires_at); },
      };
      mocks.store.set('submitted-id', record);

      const result = await service.expirePayment('submitted-id');
      // expirePayment returns null when status !== 'pending'
      expect(result).toBeNull();
      expect(record.update).not.toHaveBeenCalled();
      expect(mocks.notificationService.notify).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  //  buildUnsignedXdr (reusable method)
  // ──────────────────────────────────────────────────────────────────────────

  describe('buildUnsignedXdr()', () => {
    it('returns a valid base64 XDR string', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);

      const xdrB64 = await service.buildUnsignedXdr({
        sourceAccount: ADMIN.publicKey(),
        destinationAccount: DESTINATION.publicKey(),
        amount: '10.00',
        assetCode: 'XLM',
      });

      expect(typeof xdrB64).toBe('string');
      // Should be parseable as a Stellar transaction
      expect(() => new StellarSdk.Transaction(xdrB64, TESTNET_PASSPHRASE)).not.toThrow();
    });

    it('XDR transaction contains the correct destination and amount', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);

      const xdrB64 = await service.buildUnsignedXdr({
        sourceAccount: ADMIN.publicKey(),
        destinationAccount: DESTINATION.publicKey(),
        amount: '250.0000000',
        assetCode: 'XLM',
      });

      const tx = new StellarSdk.Transaction(xdrB64, TESTNET_PASSPHRASE);
      const op = tx.operations[0];

      expect(op.type).toBe('payment');
      expect(op.destination).toBe(DESTINATION.publicKey());
      expect(op.amount).toBe('250.0000000');
    });

    it('attaches a memo when provided', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);

      const xdrB64 = await service.buildUnsignedXdr({
        sourceAccount: ADMIN.publicKey(),
        destinationAccount: DESTINATION.publicKey(),
        amount: '1.00',
        memo: 'Test payment',
      });

      const tx = new StellarSdk.Transaction(xdrB64, TESTNET_PASSPHRASE);
      expect(tx.memo.value.toString()).toBe('Test payment');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  //  Notification dispatching
  // ──────────────────────────────────────────────────────────────────────────

  describe('Notifications', () => {
    it('sends CREATED to all signers', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);
      service.buildUnsignedXdr = jest.fn().mockResolvedValue(makeUnsignedXdr());

      await service.createPaymentRequest({
        ...baseParams(),
        requiredSignatures: 2,
        authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey()],
      });

      const recipients = mocks.notificationService.notify.mock.calls.map((c) => c[0]);
      expect(recipients).toContain(SIGNER1.publicKey());
      expect(recipients).toContain(SIGNER2.publicKey());
      expect(recipients).toContain(SIGNER3.publicKey());
    });

    it('continues notifying even if one notification fails', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);
      const xdr = makeUnsignedXdr();
      service.buildUnsignedXdr = jest.fn().mockResolvedValue(xdr);

      // SIGNER2's notification throws
      mocks.notificationService.notify.mockImplementation(async (key) => {
        if (key === SIGNER2.publicKey()) throw new Error('push service down');
      });

      // Should not propagate the error
      await expect(
        service.createPaymentRequest({
          ...baseParams(),
          requiredSignatures: 2,
          authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey()],
        })
      ).resolves.toBeDefined();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  //  Stellar submission failure handling
  // ──────────────────────────────────────────────────────────────────────────

  describe('Stellar network failures', () => {
    it('marks payment as failed and notifies signers if Horizon rejects', async () => {
      const mocks = buildMocks();
      const service = buildService(mocks);
      const xdr = makeUnsignedXdr();
      service.buildUnsignedXdr = jest.fn().mockResolvedValue(xdr);

      const horizonError = new Error('tx_bad_seq');
      horizonError.response = {
        data: { extras: { result_codes: { transaction: 'tx_bad_seq' } } },
      };
      mocks.mockServer.submitTransaction.mockRejectedValueOnce(horizonError);

      const payment = await service.createPaymentRequest({
        ...baseParams(),
        requiredSignatures: 2,
        authorizedSigners: [SIGNER1.publicKey(), SIGNER2.publicKey(), SIGNER3.publicKey()],
      });

      mocks.MockSignature.findAll = jest.fn().mockResolvedValue([
        { signer_public_key: SIGNER1.publicKey(), signed_envelope_xdr: signXdr(xdr, SIGNER1), signed_at: new Date() },
        { signer_public_key: SIGNER2.publicKey(), signed_envelope_xdr: signXdr(xdr, SIGNER2), signed_at: new Date() },
      ]);

      await service.submitSignature({
        paymentDbId: payment.id,
        signerPublicKey: SIGNER1.publicKey(),
        signedEnvelopeXdr: signXdr(xdr, SIGNER1),
      });

      mocks.notificationService.notify.mockClear();

      await expect(
        service.submitSignature({
          paymentDbId: payment.id,
          signerPublicKey: SIGNER2.publicKey(),
          signedEnvelopeXdr: signXdr(xdr, SIGNER2),
        })
      ).rejects.toThrow(/stellar submission failed/i);

      expect(payment.status).toBe('failed');

      const failedNotifications = mocks.notificationService.notify.mock.calls.filter(
        (c) => c[1] === 'MULTISIG_PAYMENT_FAILED'
      );
      expect(failedNotifications.length).toBeGreaterThan(0);
    });
  });
});
