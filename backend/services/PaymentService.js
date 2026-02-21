import * as StellarSdk from '@stellar/stellar-sdk';
const Server = StellarSdk.Horizon.Server;
const { TransactionBuilder, Networks, Operation, Asset, Keypair, Memo, Transaction: StellarTransaction } = StellarSdk;
import crypto from 'crypto';
import TagService from './TagService.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import Token from '../models/Token.js';
import AuditLog from '../models/AuditLog.js';
import db from '../config/database.js';
import { publish } from '../config/redis.js';

// Payment limits and configuration
const PAYMENT_CONFIG = {
  MAX_AMOUNT: 1000000, // Maximum XLM per transaction
  MIN_AMOUNT: 0.00001, // Minimum XLM per transaction
  BASE_FEE_PERCENTAGE: 0.001, // 0.1% fee
  MIN_FEE: 0.00001, // Minimum fee in XLM
  NETWORK_TIMEOUT: 30, // Transaction timeout in seconds
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  ACCOUNT_RESERVE: 2, // Minimum XLM to keep in account
};

class PaymentService {
  constructor() {
    this.server = new Server('https://horizon.stellar.org');
    this.networkPassphrase = Networks.PUBLIC;
    this.logger = console;
  }

  /**
   * Resolve @tag to Stellar address
   * @param {string} tag - The @tag to resolve
   * @returns {string} Stellar address
   */
  async resolveTag(tag) {
    const tagData = await TagService.resolveTag(tag);
    if (!tagData) {
      throw new Error(`Tag ${tag} not found`);
    }
    return tagData.stellar_address;
  }

  /**
   * Validate payment request with comprehensive checks
   * @param {Object} paymentData
   * @param {string} paymentData.senderTag
   * @param {string} paymentData.recipientTag
   * @param {string} paymentData.amount
   * @param {string} paymentData.asset - 'XLM' or asset code
   * @param {string} paymentData.assetIssuer - Issuer for custom assets
   * @param {string} paymentData.memo
   * @throws {Error} if validation fails
   * @returns {Object} validated payment data
   */
  async validatePayment({ senderTag, recipientTag, amount, asset = 'XLM', assetIssuer, memo }) {
    // Validate required fields
    if (!senderTag || !recipientTag || !amount) {
      throw new Error('Missing required payment parameters: senderTag, recipientTag, amount');
    }

    // Validate tags format
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(senderTag)) {
      throw new Error('Invalid sender tag format. Must be 3-20 alphanumeric characters');
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(recipientTag)) {
      throw new Error('Invalid recipient tag format. Must be 3-20 alphanumeric characters');
    }

    // Validate amount
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      throw new Error('Invalid amount: must be a valid number');
    }
    if (numAmount < PAYMENT_CONFIG.MIN_AMOUNT) {
      throw new Error(`Amount must be at least ${PAYMENT_CONFIG.MIN_AMOUNT} XLM`);
    }
    if (numAmount > PAYMENT_CONFIG.MAX_AMOUNT) {
      throw new Error(`Amount exceeds maximum limit of ${PAYMENT_CONFIG.MAX_AMOUNT} XLM`);
    }

    // Validate asset
    if (asset !== 'XLM' && !asset.match(/^[A-Z0-9]{1,12}$/)) {
      throw new Error('Invalid asset code. Must be 1-12 uppercase alphanumeric characters');
    }

    // Validate custom asset issuer
    if (asset !== 'XLM' && !assetIssuer) {
      throw new Error('Asset issuer required for custom assets');
    }
    if (assetIssuer && !assetIssuer.match(/^G[A-Z0-9]{55}$/)) {
      throw new Error('Invalid Stellar address format for asset issuer');
    }

    // Validate memo if provided
    if (memo && memo.length > 28) {
      throw new Error('Memo must be 28 characters or less');
    }

    // Resolve addresses
    const senderAddress = await this.resolveTag(senderTag);
    const recipientAddress = await this.resolveTag(recipientTag);

    // Validate addresses are different
    if (senderAddress === recipientAddress) {
      throw new Error('Cannot send payment to yourself');
    }

    // Validate recipient address format
    if (!recipientAddress.match(/^G[A-Z0-9]{55}$/)) {
      throw new Error('Invalid recipient Stellar address');
    }

    return {
      senderAddress,
      recipientAddress,
      amount: numAmount,
      asset,
      assetIssuer: assetIssuer || null
    };
  }

  /**
   * Check account balance with retry logic and detailed error handling
   * @param {string} address - Stellar address
   * @param {string} asset - Asset code ('XLM' for native)
   * @param {string} assetIssuer - Issuer for custom assets
   * @returns {number} balance
   * @throws {Error} if account not found or network error
   */
  async getBalance(address, asset = 'XLM', assetIssuer = null) {
    let lastError;

    for (let attempt = 1; attempt <= PAYMENT_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const account = await this.server.loadAccount(address);
        
        const balance = account.balances.find(b => {
          if (asset === 'XLM') {
            return b.asset_type === 'native';
          }
          return b.asset_code === asset && (!assetIssuer || b.asset_issuer === assetIssuer);
        });

        return balance ? parseFloat(balance.balance) : 0;
      } catch (error) {
        lastError = error;
        this.logger.warn(`Balance check attempt ${attempt}/${PAYMENT_CONFIG.MAX_RETRIES} failed: ${error.message}`);

        // Check if it's a network error worth retrying
        if (this._isNetworkError(error) && attempt < PAYMENT_CONFIG.MAX_RETRIES) {
          const delay = PAYMENT_CONFIG.RETRY_DELAY_MS * attempt;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        break;
      }
    }

    throw new Error(`Failed to load account balance: ${lastError.message}`);
  }

  /**
   * Check if account requires multi-signature with retry logic
   * @param {string} address - Stellar address
   * @returns {Object} { required: boolean, threshold: number, signers: Array }
   * @throws {Error} if unable to check multi-sig requirement
   */
  async checkMultiSigRequirement(address) {
    let lastError;

    for (let attempt = 1; attempt <= PAYMENT_CONFIG.MAX_RETRIES; attempt++) {
      try {
        const account = await this.server.loadAccount(address);
        const threshold = account.thresholds.high_threshold || account.thresholds.med_threshold || account.thresholds.low_threshold || 1;
        const signers = account.signers || [];

        // Multi-sig required if threshold > 1 or multiple signers with weight > 0
        const required = threshold > 1 || signers.filter(s => s.weight > 0).length > 1;

        return {
          required,
          threshold,
          signers: signers.map(s => ({ key: s.key, weight: s.weight, type: s.type }))
        };
      } catch (error) {
        lastError = error;
        this.logger.warn(`Multi-sig check attempt ${attempt}/${PAYMENT_CONFIG.MAX_RETRIES} failed: ${error.message}`);

        if (this._isNetworkError(error) && attempt < PAYMENT_CONFIG.MAX_RETRIES) {
          const delay = PAYMENT_CONFIG.RETRY_DELAY_MS * attempt;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        break;
      }
    }

    throw new Error(`Failed to check multi-sig requirement: ${lastError.message}`);
  }

  /**
   * Calculate transaction fee based on amount and asset
   * @param {number} amount - Transaction amount
   * @param {string} asset - Asset code
   * @returns {Object} { fee: number, baseFee: number, networkFee: number }
   */
  calculateFee(amount, asset = 'XLM') {
    // Base fee: 0.1% of transaction amount, minimum 0.00001 XLM
    const baseFee = Math.max(amount * PAYMENT_CONFIG.BASE_FEE_PERCENTAGE, PAYMENT_CONFIG.MIN_FEE);
    
    // Network fee (Stellar base fee in stroops converted to XLM)
    const networkFee = 0.00001; // 100 stroops = 0.00001 XLM
    
    const totalFee = baseFee + networkFee;

    return {
      fee: totalFee,
      baseFee,
      networkFee,
      percentage: PAYMENT_CONFIG.BASE_FEE_PERCENTAGE * 100
    };
  }

  /**
   * Create and sign Stellar transaction with atomic operations
   * @param {Object} params
   * @param {string} params.senderAddress - Sender Stellar address
   * @param {string} params.recipientAddress - Recipient Stellar address
   * @param {number} params.amount - Amount to send
   * @param {string} params.asset - Asset code ('XLM' for native)
   * @param {string} params.assetIssuer - Issuer for custom assets
   * @param {string} params.memo - Optional memo text
   * @param {Array<string>} params.secrets - Array of secret keys for signing
   * @returns {string} signed transaction XDR
   * @throws {Error} if transaction creation fails
   */
  async createTransaction({ senderAddress, recipientAddress, amount, asset = 'XLM', assetIssuer, memo, secrets }) {
    try {
      if (!secrets || secrets.length === 0) {
        throw new Error('At least one secret key is required for signing');
      }

      // Check multi-sig requirement
      const multiSigInfo = await this.checkMultiSigRequirement(senderAddress);
      
      if (multiSigInfo.required && secrets.length < 2) {
        throw new Error(`Multi-signature account requires at least 2 signatures, but only ${secrets.length} provided`);
      }

      // Load sender account for sequence number
      const senderAccount = await this.server.loadAccount(senderAddress);

      // Build transaction
      const transactionBuilder = new TransactionBuilder(senderAccount, {
        fee: '100', // Base fee in stroops (0.00001 XLM)
        networkPassphrase: this.networkPassphrase,
      });

      // Add memo if provided
      if (memo) {
        if (memo.length > 28) {
          throw new Error('Memo exceeds maximum length of 28 characters');
        }
        transactionBuilder.addMemo(Memo.text(memo));
      }

      // Create payment operation
      let paymentOp;
      if (asset === 'XLM') {
        paymentOp = Operation.payment({
          destination: recipientAddress,
          asset: Asset.native(),
          amount: amount.toString(),
        });
      } else {
        if (!assetIssuer) {
          throw new Error('Asset issuer required for custom assets');
        }
        paymentOp = Operation.payment({
          destination: recipientAddress,
          asset: new Asset(asset, assetIssuer),
          amount: amount.toString(),
        });
      }

      transactionBuilder.addOperation(paymentOp);

      // Set timeout and build
      const transaction = transactionBuilder.setTimeout(PAYMENT_CONFIG.NETWORK_TIMEOUT).build();

      // Sign with all provided secrets
      const signedSecrets = new Set();
      secrets.forEach(secret => {
        try {
          const keypair = Keypair.fromSecret(secret);
          transaction.sign(keypair);
          signedSecrets.add(keypair.publicKey());
        } catch (error) {
          throw new Error(`Invalid secret key: ${error.message}`);
        }
      });

      if (signedSecrets.size !== secrets.length) {
        throw new Error('Duplicate secret keys provided');
      }

      return transaction.toEnvelope().toXDR('base64');
    } catch (error) {
      throw new Error(`Failed to create transaction: ${error.message}`);
    }
  }

  /**
   * Submit transaction to Stellar network with exponential backoff retry logic
   * @param {string} signedXdr - Signed transaction XDR
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Object} transaction result with hash, ledger, and full result
   * @throws {Error} if submission fails after all retries
   */
  async submitTransaction(signedXdr, maxRetries = PAYMENT_CONFIG.MAX_RETRIES) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const transaction = new StellarTransaction(signedXdr, this.networkPassphrase);
        const result = await this.server.submitTransaction(transaction);

        this.logger.log(`Transaction submitted successfully on attempt ${attempt}. Hash: ${result.hash}`);

        return {
          successful: true,
          hash: result.hash,
          ledger: result.ledger,
          createdAt: result.created_at,
          result: result
        };
      } catch (error) {
        lastError = error;
        this.logger.warn(`Transaction submission attempt ${attempt}/${maxRetries} failed: ${error.message}`);

        // Check if it's a network error worth retrying
        if (this._isNetworkError(error) && attempt < maxRetries) {
          // Exponential backoff with jitter
          const baseDelay = PAYMENT_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          const jitter = Math.random() * 1000;
          const delay = Math.min(baseDelay + jitter, 10000); // Max 10s
          
          this.logger.log(`Retrying in ${Math.round(delay)}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // For non-network errors, don't retry
        break;
      }
    }

    throw new Error(`Transaction submission failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Process @tag-to-@tag payment with full validation and atomic transaction handling
   * Supports idempotency keys to prevent duplicate processing.
   * @param {Object} paymentData
   * @param {string} paymentData.senderTag - Sender @tag
   * @param {string} paymentData.recipientTag - Recipient @tag
   * @param {number} paymentData.amount - Amount to send
   * @param {string} paymentData.asset - Asset code (default: 'XLM')
   * @param {string} paymentData.assetIssuer - Issuer for custom assets
   * @param {string} paymentData.memo - Optional payment memo
   * @param {Array<string>} paymentData.secrets - Secret keys for signing
   * @param {number} paymentData.userId - User ID for transaction record
   * @param {string} paymentData.idempotencyKey - Optional idempotency key to prevent duplicate processing
   * @returns {Object} payment result with transaction ID and hash
   * @throws {Error} if payment processing fails
   */
  async processPayment({ senderTag, recipientTag, amount, asset = 'XLM', assetIssuer, memo, secrets, userId, idempotencyKey }) {
    const effectiveIdempotencyKey = idempotencyKey || this._generateIdempotencyKey({ senderTag, recipientTag, amount, userId });
    const trx = await db.transaction();
    let transactionRecord = null;

    try {
      // Step 0: Idempotency check - return existing completed result or reject duplicates
      const existingTransaction = await Transaction.findByIdempotencyKey(effectiveIdempotencyKey, trx);
      if (existingTransaction) {
        await trx.commit();
        if (existingTransaction.status === 'completed') {
          return {
            success: true,
            transactionId: existingTransaction.id,
            txHash: existingTransaction.tx_hash,
            amount: parseFloat(existingTransaction.amount),
            asset: asset || 'XLM',
            senderTag,
            recipientTag,
            idempotentReplay: true
          };
        }
        if (existingTransaction.status === 'failed') {
          throw new Error(`Payment previously failed: ${existingTransaction.extra || 'Unknown error'}`);
        }
        throw new Error('Payment already in progress with this idempotency key');
      }

      // Step 1: Validate payment parameters
      this.logger.log(`Processing payment: ${senderTag} -> ${recipientTag}, amount: ${amount} ${asset}`);
      
      const { senderAddress, recipientAddress, amount: validatedAmount, assetIssuer: validatedAssetIssuer } = await this.validatePayment({
        senderTag,
        recipientTag,
        amount,
        asset,
        assetIssuer,
        memo
      });

      // Step 2: Get token information
      const tokenSymbol = asset === 'XLM' ? 'XLM' : asset;
      const token = await Token.findBySymbol(tokenSymbol);
      if (!token) {
        throw new Error(`Token ${tokenSymbol} not found in database`);
      }

      // Step 3: Check sender balance
      const balance = await this.getBalance(senderAddress, asset, validatedAssetIssuer);
      const feeInfo = this.calculateFee(validatedAmount, asset);
      const totalCost = validatedAmount + feeInfo.fee;

      this.logger.log(`Balance check: ${balance} ${asset}, required: ${totalCost} ${asset}`);

      if (balance < totalCost) {
        throw new Error(`Insufficient funds. Balance: ${balance} ${asset}, required: ${totalCost} ${asset}`);
      }

      // Step 4: Verify recipient account exists
      try {
        await this.server.loadAccount(recipientAddress);
      } catch (error) {
        throw new Error(`Recipient account does not exist on Stellar network`);
      }

      // Step 5: Calculate USD value
      const usdValue = validatedAmount * (token.price || 0);

      // Step 6: Create transaction record (pending status) with idempotency key
      const transactionData = {
        user_id: userId,
        token_id: token.id,
        chain_id: 6, // Stellar chain ID
        reference: `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        idempotency_key: effectiveIdempotencyKey,
        type: 'payment',
        status: 'pending',
        amount: validatedAmount,
        usd_value: usdValue,
        from_address: senderAddress,
        to_address: recipientAddress,
        description: memo || `Payment from ${senderTag} to ${recipientTag}`,
        notes: notes || null,
        extra: JSON.stringify({
          fee: feeInfo.fee,
          baseFee: feeInfo.baseFee,
          networkFee: feeInfo.networkFee,
          asset,
          assetIssuer: validatedAssetIssuer,
          senderTag,
          recipientTag
        })
      };

      transactionRecord = await Transaction.create(transactionData, trx);
      this.logger.log(`Transaction record created: ${transactionRecord.id}`);

      // Publish pending transaction event
      await publish('transaction:updates', {
        id: transactionRecord.id,
        user_id: userId,
        status: 'pending',
        amount: validatedAmount,
        asset,
        reference: transactionData.reference,
        type: 'payment',
        timestamp: new Date().toISOString()
      });

      // Step 7: Create and sign Stellar transaction
      const signedXdr = await this.createTransaction({
        senderAddress,
        recipientAddress,
        amount: validatedAmount,
        asset,
        assetIssuer: validatedAssetIssuer,
        memo,
        secrets
      });
      this.logger.log(`Transaction signed successfully`);

      // Step 8: Submit to Stellar network (outside DB trx - cannot be rolled back)
      let submitResult;
      try {
        submitResult = await this.submitTransaction(signedXdr);
        this.logger.log(`Transaction submitted to network: ${submitResult.hash}`);
      } catch (stellarError) {
        throw stellarError;
      }

      // Step 9: Update transaction record with success and commit
      try {
        await Transaction.update(transactionRecord.id, {
          status: 'completed',
          tx_hash: submitResult.hash,
          timestamp: submitResult.createdAt || new Date().toISOString()
        }, trx);
        await trx.commit();
      } catch (dbError) {
        await trx.rollback();
        // Stellar succeeded but DB failed - attempt compensation (insert recovery record)
        await this._attemptCompensation({
          transactionRecord,
          stellarHash: submitResult.hash,
          error: dbError,
          userId,
          token,
          usdValue,
          feeInfo,
          paymentContext: { senderTag, recipientTag, amount: validatedAmount, asset, senderAddress, recipientAddress }
        });
        return {
          success: true,
          transactionId: transactionRecord.id,
          txHash: submitResult.hash,
          ledger: submitResult.ledger,
          amount: validatedAmount,
          fee: feeInfo.fee,
          asset,
          senderTag,
          recipientTag,
          timestamp: submitResult.createdAt,
          compensationApplied: true
        };
      }

      this.logger.log(`Payment completed successfully: ${transactionRecord.id}`);

      return {
        success: true,
        transactionId: transactionRecord.id,
        txHash: submitResult.hash,
        ledger: submitResult.ledger,
        amount: validatedAmount,
        fee: feeInfo.fee,
        asset,
        senderTag,
        recipientTag,
        timestamp: submitResult.createdAt
      };

    } catch (error) {
      try {
        await trx.rollback();
        // Mark transaction as failed if record was created (rollback reverses DB changes, but we log for audit)
        if (transactionRecord) {
          await this._handleFailedTransaction({
            transactionRecord,
            error,
            userId,
            paymentContext: { senderTag, recipientTag, amount, asset }
          });
        }
      } catch (rollbackError) {
        this.logger.error(`Rollback failed: ${rollbackError.message}`);
      }
      this.logger.error(`Payment processing failed: ${error.message}`);
      
      // If we have a transaction record ID, we should publish a failure event
      if (transactionRecord && transactionRecord.id) {
        try {
          // Update record separately to 'failed' if trx rolled back
          await Transaction.update(transactionRecord.id, {
            status: 'failed',
            extra: JSON.stringify({ error: error.message })
          });

          await publish('transaction:updates', {
            id: transactionRecord.id,
            user_id: userId,
            status: 'failed',
            error: error.message,
            amount: amount,
            asset: asset,
            timestamp: new Date().toISOString()
          });
        } catch (pubError) {
          this.logger.error(`Failed to publish failure event: ${pubError.message}`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Handle failed transaction: create audit log for failed payments
   * Note: After rollback, the transaction record is not in DB; we log for audit trail
   * @private
   */
  async _handleFailedTransaction({ transactionRecord, error, userId, paymentContext }) {
    try {
      await AuditLog.createFailedTransactionAudit({
        userId,
        resourceId: transactionRecord.id,
        details: {
          error: error.message,
          attemptedTransactionId: transactionRecord.id,
          reference: transactionRecord.reference,
          ...paymentContext,
          failedAt: new Date().toISOString()
        }
      });
    } catch (auditError) {
      this.logger.error(`Failed to create audit log for failed transaction: ${auditError.message}`);
    }
  }

  /**
   * Attempt compensation when Stellar succeeds but DB commit fails
   * Inserts recovery record so funds are not lost or double-counted
   * @private
   */
  async _attemptCompensation({ transactionRecord, stellarHash, error, userId, token, usdValue, feeInfo, paymentContext }) {
    this.logger.warn(`Compensation required: Stellar tx ${stellarHash} succeeded but DB update failed`);
    try {
      const extra = typeof transactionRecord.extra === 'string' ? JSON.parse(transactionRecord.extra || '{}') : (transactionRecord.extra || {});
      const recoveryData = {
        user_id: userId,
        token_id: token.id,
        chain_id: 6,
        reference: transactionRecord.reference,
        idempotency_key: transactionRecord.idempotency_key,
        type: 'payment',
        status: 'completed',
        amount: transactionRecord.amount,
        usd_value: usdValue,
        from_address: paymentContext.senderAddress,
        to_address: paymentContext.recipientAddress,
        tx_hash: stellarHash,
        timestamp: new Date().toISOString(),
        description: transactionRecord.description,
        extra: JSON.stringify({ ...extra, compensation_recovered: true, original_db_error: error.message })
      };
      const recovered = await Transaction.create(recoveryData);
      await AuditLog.createFailedTransactionAudit({
        userId,
        resourceId: recovered.id,
        details: {
          action: 'compensation_recovery',
          stellarHash,
          originalError: error.message,
          ...paymentContext,
          recoveredAt: new Date().toISOString()
        }
      });
    } catch (compensationError) {
      this.logger.error(`Compensation failed - manual reconciliation required for tx ${stellarHash}: ${compensationError.message}`);
      await AuditLog.createFailedTransactionAudit({
        userId,
        resourceId: null,
        details: {
          action: 'compensation_failed',
          stellarHash,
          requires_manual_reconciliation: true,
          originalError: error.message,
          compensationError: compensationError.message,
          ...paymentContext
        }
      });
    }
  }

  /**
   * Generate idempotency key from payment params (used when client doesn't provide one)
   * @private
   */
  _generateIdempotencyKey({ senderTag, recipientTag, amount, userId }) {
    return crypto
      .createHash('sha256')
      .update(`${userId}:${senderTag}:${recipientTag}:${amount}:${Date.now()}`)
      .digest('hex')
      .substring(0, 64);
  }

  /**
   * Get transaction history for a @tag
   * @param {string} tag - User @tag
   * @param {Object} options - Query options (limit, offset, from, to, type)
   * @returns {Array} transaction records
   * @throws {Error} if user not found
   */
  async getTransactionHistory(tag, options = {}) {
    const user = await User.findByTag(tag);
    if (!user) {
      throw new Error('User not found');
    }

    return await Transaction.getByUser(user.id, options);
  }

  /**
   * Get transaction details by ID
   * @param {number} transactionId - Transaction ID
   * @returns {Object} transaction details
   * @throws {Error} if transaction not found
   */
  async getTransactionDetails(transactionId) {
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    return transaction;
  }

  /**
   * Check if error is network-related and worth retrying
   * @private
   * @param {Error} error - Error object
   * @returns {boolean} true if network error
   */
  _isNetworkError(error) {
    const networkErrorPatterns = [
      'network',
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'timeout',
      'socket hang up'
    ];

    const errorMessage = error.message || '';
    const errorCode = error.code || '';

    return networkErrorPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern.toLowerCase()) ||
      errorCode.includes(pattern)
    );
  }

  /**
   * Validate Stellar address format
   * @private
   * @param {string} address - Address to validate
   * @returns {boolean} true if valid Stellar address
   */
  _isValidStellarAddress(address) {
    return /^G[A-Z0-9]{55}$/.test(address);
  }

  /**
   * Get payment limits configuration
   * @returns {Object} payment limits
   */
  getPaymentLimits() {
    return {
      maxAmount: PAYMENT_CONFIG.MAX_AMOUNT,
      minAmount: PAYMENT_CONFIG.MIN_AMOUNT,
      baseFeePercentage: PAYMENT_CONFIG.BASE_FEE_PERCENTAGE * 100,
      minFee: PAYMENT_CONFIG.MIN_FEE
    };
  }
}

export default new PaymentService();