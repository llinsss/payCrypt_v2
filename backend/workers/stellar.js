/**
 * Stellar Payment Worker
 * Processes queued payments and submits them to the Stellar network
 * Uses the Stellar JavaScript SDK
 */

import redis from "../config/database.js";
import { Transaction as TransactionModel } from "../models/index.js";
import db from "../config/database.js";

// Configuration for Stellar network
const STELLAR_CONFIG = {
  network: process.env.STELLAR_NETWORK || "testnet",
  rpcUrl: process.env.STELLAR_RPC_URL || "https://horizon-testnet.stellar.org",
  accountSecretKey: process.env.STELLAR_ACCOUNT_SECRET, // Master account for signing
  networkPassphrase:
    process.env.STELLAR_NETWORK === "public"
      ? "Public Global Stellar Network ; September 2015"
      : "Test SDF Network ; September 2015",
};

class StellarPaymentWorker {
  constructor() {
    this.stellar = null;
    this.server = null;
    this.sourceAccount = null;
    this.isRunning = false;
  }

  /**
   * Initialize Stellar SDK connection
   * NOTE: This requires the stellar-sdk package to be installed
   * Install with: npm install stellar
   */
  async initialize() {
    try {
      // Import Stellar SDK
      // eslint-disable-next-line import/no-unresolved
      const stellar = await import("stellar-sdk");

      this.stellar = stellar;
      this.server = new stellar.Server(STELLAR_CONFIG.rpcUrl);

      console.log(`✅ Stellar worker initialized on ${STELLAR_CONFIG.network}`);
      return true;
    } catch (error) {
      console.error(
        "❌ Failed to initialize Stellar worker:",
        error.message
      );
      return false;
    }
  }

  /**
   * Start the payment processing worker
   * Polls Redis for pending transactions and processes them
   */
  async start() {
    if (!this.isRunning) {
      const initialized = await this.initialize();
      if (!initialized) {
        console.error("Stellar worker failed to initialize");
        return;
      }

      this.isRunning = true;
      console.log("🚀 Stellar Payment Worker started");

      // Poll for pending transactions every 5 seconds
      this.pollInterval = setInterval(() => this.processPendingTransactions(), 5000);
    }
  }

  /**
   * Stop the payment processing worker
   */
  async stop() {
    if (this.isRunning) {
      this.isRunning = false;
      clearInterval(this.pollInterval);
      console.log("⏹️ Stellar Payment Worker stopped");
    }
  }

  /**
   * Process all pending Stellar transactions
   */
  async processPendingTransactions() {
    try {
      // Get all pending transactions from Redis
      const keys = await redis.keys("stellar:pending:*");

      if (keys.length === 0) {
        return; // Nothing to process
      }

      console.log(`Processing ${keys.length} pending Stellar transactions...`);

      for (const key of keys) {
        try {
          const data = await redis.get(key);
          if (!data) continue;

          const transactionData = JSON.parse(data);
          await this.processTransaction(transactionData, key);
        } catch (error) {
          console.error(`Error processing transaction from key ${key}:`, error);
        }
      }
    } catch (error) {
      console.error("Error polling pending transactions:", error);
    }
  }

  /**
   * Process a single transaction
   * @param {Object} transactionData - Transaction data to process
   * @param {string} redisKey - Redis key for cleanup
   */
  async processTransaction(transactionData, redisKey) {
    const { transactionId, senderAddress, recipientAddress, amount, asset, memo, fees } =
      transactionData;

    let txRecord = null;

    try {
      // Get transaction record
      txRecord = await db("transactions").where("id", transactionId).first();
      if (!txRecord) {
        console.warn(`Transaction record ${transactionId} not found`);
        await redis.del(redisKey);
        return;
      }

      // Build and submit transaction
      const result = await this.submitTransaction({
        senderAddress,
        recipientAddress,
        amount,
        asset,
        memo,
      });

      // Update transaction record with success
      await db("transactions")
        .where("id", transactionId)
        .update({
          status: "completed",
          tx_hash: result.hash,
          extra: JSON.stringify({
            ...JSON.parse(txRecord.extra || "{}"),
            stellar_hash: result.hash,
            submitted_at: new Date().toISOString(),
            confirmed_at: new Date().toISOString(),
          }),
        });

      console.log(`✅ Transaction ${transactionId} submitted to Stellar: ${result.hash}`);

      // Remove from pending queue
      await redis.del(redisKey);
    } catch (error) {
      console.error(`Error processing transaction ${transactionId}:`, error.message);

      // Increment retry count
      if (txRecord) {
        const extra = JSON.parse(txRecord.extra || "{}");
        const retryCount = (extra.retry_count || 0) + 1;

        if (retryCount >= 5) {
          // Max retries reached
          await db("transactions")
            .where("id", transactionId)
            .update({
              status: "failed",
              extra: JSON.stringify({
                ...extra,
                retry_count: retryCount,
                error: error.message,
                failed_at: new Date().toISOString(),
              }),
            });

          console.error(`❌ Transaction ${transactionId} failed after 5 retries`);
          await redis.del(redisKey);
        } else {
          // Retry later
          await db("transactions")
            .where("id", transactionId)
            .update({
              extra: JSON.stringify({
                ...extra,
                retry_count: retryCount,
                last_error: error.message,
              }),
            });

          console.log(`⏳ Retrying transaction ${transactionId} (attempt ${retryCount})`);
        }
      }
    }
  }

  /**
   * Submit a transaction to the Stellar network
   * @param {Object} params - Transaction parameters
   * @returns {Promise<Object>} Transaction result with hash
   */
  async submitTransaction({ senderAddress, recipientAddress, amount, asset, memo }) {
    if (!this.stellar || !this.server) {
      throw new Error("Stellar SDK not initialized");
    }

    try {
      // Get account information
      const account = await this.server.loadAccount(senderAddress);

      // Build transaction
      let txBuilder = new this.stellar.TransactionBuilder(account, {
        fee: this.stellar.BASE_FEE,
        networkPassphrase: STELLAR_CONFIG.networkPassphrase,
        timebounds: {
          minTime: 0,
          maxTime: Math.floor(Date.now() / 1000) + 300, // 5 minute timeout
        },
      });

      // Add memo if provided
      if (memo) {
        txBuilder = txBuilder.addMemo(new this.stellar.Memo.text(memo));
      }

      // Create payment operation
      if (asset.toUpperCase() === "XLM") {
        // Native XLM payment
        txBuilder = txBuilder.addOperation(
          this.stellar.Operation.payment({
            destination: recipientAddress,
            asset: this.stellar.Asset.native(),
            amount: amount.toString(),
          })
        );
      } else {
        // Custom asset payment (requires issuer)
        // This would need to be configured in environment
        const issuer = process.env[`STELLAR_${asset.toUpperCase()}_ISSUER`];
        if (!issuer) {
          throw new Error(`No issuer configured for asset ${asset}`);
        }

        txBuilder = txBuilder.addOperation(
          this.stellar.Operation.payment({
            destination: recipientAddress,
            asset: new this.stellar.Asset(asset.toUpperCase(), issuer),
            amount: amount.toString(),
          })
        );
      }

      // Build the transaction
      const transaction = txBuilder.build();

      // Sign transaction with sender's keypair
      // NOTE: In production, this should use proper key management (HSM, KMS, etc.)
      const sourceKeypair = this.stellar.Keypair.fromSecret(senderAddress);
      transaction.sign(sourceKeypair);

      // Submit to network
      const result = await this.server.submitTransaction(transaction);

      return {
        hash: result.hash,
        ledger: result.ledger,
        created_at: result.created_at,
      };
    } catch (error) {
      throw new Error(`Stellar submission failed: ${error.message}`);
    }
  }

  /**
   * Get transaction status from Stellar network
   * @param {string} hash - Transaction hash
   * @returns {Promise<Object>} Transaction details
   */
  async getTransactionStatus(hash) {
    if (!this.server) {
      throw new Error("Stellar server not initialized");
    }

    try {
      const transaction = await this.server.transactions().transaction(hash).call();
      return {
        status: "confirmed",
        ledger: transaction.ledger,
        created_at: transaction.created_at,
        source_account: transaction.source_account,
        operations_count: transaction.operation_count,
      };
    } catch (error) {
      if (error.status === 404) {
        return {
          status: "pending",
          message: "Transaction not yet confirmed",
        };
      }
      throw error;
    }
  }

  /**
   * Verify account exists on Stellar network
   * @param {string} publicKey - Stellar public key
   * @returns {Promise<boolean>}
   */
  async verifyAccount(publicKey) {
    if (!this.server) {
      throw new Error("Stellar server not initialized");
    }

    try {
      await this.server.loadAccount(publicKey);
      return true;
    } catch (error) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Fund account with initial XLM (testnet only)
   * @param {string} publicKey - Stellar public key
   * @returns {Promise<Object>} Funding result
   */
  async fundAccount(publicKey) {
    if (STELLAR_CONFIG.network !== "testnet") {
      throw new Error("Account funding only available on testnet");
    }

    try {
      const response = await fetch(`${STELLAR_CONFIG.rpcUrl}/friendbot`, {
        method: "GET",
        params: { addr: publicKey },
      });

      const data = await response.json();
      return {
        status: "success",
        hash: data.hash,
        message: "Account funded with test XLM",
      };
    } catch (error) {
      throw new Error(`Failed to fund account: ${error.message}`);
    }
  }
}

// Create and export singleton instance
const paymentWorker = new StellarPaymentWorker();

export default paymentWorker;
