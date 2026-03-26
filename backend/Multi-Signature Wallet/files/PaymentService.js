'use strict';

/**
 * PaymentService
 *
 * Handles standard (single-signer) Stellar payments.
 * The XDR-building logic has been extracted to `buildUnsignedXdr()` so it
 * can also be called by MultiSigService without duplication.
 */

const StellarSdk = require('@stellar/stellar-sdk');

class PaymentService {
  constructor({ stellarHorizonUrl, networkPassphrase } = {}) {
    this.server = new StellarSdk.Horizon.Server(
      stellarHorizonUrl ?? 'https://horizon-testnet.stellar.org'
    );
    this.networkPassphrase = networkPassphrase ?? StellarSdk.Networks.TESTNET;
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SINGLE-SIGNER PAYMENT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build, sign, and immediately submit a single-signer payment.
   *
   * @param {object} params
   * @param {string} params.sourceSecretKey   - S… secret key of the source account
   * @param {string} params.destinationAccount
   * @param {string} params.amount
   * @param {string} [params.assetCode='XLM']
   * @param {string} [params.assetIssuer]
   * @param {string} [params.memo]
   * @returns {Promise<StellarSdk.Horizon.HorizonApi.SubmitTransactionResponse>}
   */
  async sendPayment({ sourceSecretKey, destinationAccount, amount, assetCode = 'XLM', assetIssuer, memo }) {
    const keypair = StellarSdk.Keypair.fromSecret(sourceSecretKey);

    const unsignedXdr = await this.buildUnsignedXdr({
      sourceAccount: keypair.publicKey(),
      destinationAccount,
      amount,
      assetCode,
      assetIssuer,
      memo,
    });

    const tx = new StellarSdk.Transaction(unsignedXdr, this.networkPassphrase);
    tx.sign(keypair);

    return this.server.submitTransaction(tx);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SHARED XDR BUILDER  (also used by MultiSigService)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fetch the account sequence number and build an *unsigned* transaction
   * envelope XDR.  Returns the XDR as a base64 string.
   *
   * This is intentionally stateless and has no DB side-effects so it can be
   * called freely from both single-sig and multi-sig workflows.
   *
   * @param {object} params
   * @param {string}   params.sourceAccount
   * @param {string}   params.destinationAccount
   * @param {string}   params.amount
   * @param {string}   [params.assetCode='XLM']
   * @param {string}   [params.assetIssuer]
   * @param {string}   [params.memo]
   * @param {number}   [params.timeoutSeconds=300]
   * @returns {Promise<string>} Base64-encoded unsigned transaction XDR
   */
  async buildUnsignedXdr({
    sourceAccount,
    destinationAccount,
    amount,
    assetCode = 'XLM',
    assetIssuer = null,
    memo = null,
    timeoutSeconds = 300,
  }) {
    const accountResponse = await this.server.loadAccount(sourceAccount);

    const asset =
      assetCode === 'XLM'
        ? StellarSdk.Asset.native()
        : new StellarSdk.Asset(assetCode, assetIssuer);

    const builder = new StellarSdk.TransactionBuilder(accountResponse, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    });

    builder.addOperation(
      StellarSdk.Operation.payment({
        destination: destinationAccount,
        asset,
        amount: String(amount),
      })
    );

    if (memo) {
      builder.addMemo(StellarSdk.Memo.text(memo));
    }

    builder.setTimeout(timeoutSeconds);

    const tx = builder.build();
    return tx.toEnvelope().toXDR('base64');
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  MULTI-SIG DETECTION  (existing — preserved from original implementation)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check whether a Stellar account has multi-sig requirements set on-chain.
   *
   * @param {string} accountId - G… public key
   * @returns {Promise<{ isMultiSig: boolean, thresholds: object, signers: object[] }>}
   */
  async checkMultiSigRequirement(accountId) {
    const account = await this.server.loadAccount(accountId);

    const { low_threshold, med_threshold, high_threshold } = account.thresholds;
    const { signers } = account;

    const isMultiSig =
      signers.length > 1 ||
      med_threshold > 1 ||
      high_threshold > 1;

    return {
      isMultiSig,
      thresholds: { low: low_threshold, med: med_threshold, high: high_threshold },
      signers,
    };
  }
}

module.exports = PaymentService;
