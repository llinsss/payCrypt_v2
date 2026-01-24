import db from "../config/database.js";
import { User, Transaction, Balance, Token } from "../models/index.js";
import TagService from "./TagService.js";
import redis from "../config/redis.js";
import { NGN_KEY } from "../config/initials.js";
import BigNumber from "bignumber.js";

// Configuration for Stellar network
const STELLAR_CONFIG = {
  baseReserve: "2.5", // XLM base reserve per account
  baseFee: "0.00001", // XLM per operation
  maxMemoLength: 28,
  xlmDecimals: 7,
  minPaymentAmount: "0.0000001", // 1 stroops in XLM
};

// Payment limits (in USD)
const PAYMENT_LIMITS = {
  minAmount: 1, // $1 minimum
  maxAmount: 100000, // $100k maximum per transaction
  dailyLimit: 1000000, // $1M daily limit per user
  maxTransactionsPerDay: 1000,
};

// Fee structure
const FEE_STRUCTURE = {
  percentageFee: 0.01, // 1% transaction fee
  minFixedFee: 0.01, // $0.01 minimum fee in USD
  maxFixedFee: 100, // $100 maximum fee in USD
};

class PaymentService {
  /**
   * Resolve a @tag to get the recipient's user and Stellar address
   * @param {string} tag - The @tag to resolve (with or without @)
   * @returns {Promise<Object>} User object and Stellar address
   */
  async resolveTag(tag) {
    try {
      const cleanTag = tag.replace(/^@/, "").toLowerCase();

      // First try to find in users table (primary @tag resolution)
      const user = await User.findByTag(cleanTag);
      if (user) {
        return {
          user,
          stellarAddress: user.address, // Assuming users have a stellar address
        };
      }

      // Fallback to stellar_tags table for explicit stellar tag mappings
      const tagMapping = await TagService.resolveTag(cleanTag);
      if (tagMapping) {
        // Find the associated user
        const tagUser = await User.findByAddress(tagMapping.stellar_address);
        return {
          user: tagUser,
          stellarAddress: tagMapping.stellar_address,
        };
      }

      throw new Error(`Tag @${cleanTag} not found`);
    } catch (error) {
      throw new Error(`Failed to resolve tag: ${error.message}`);
    }
  }

  /**
   * Validate payment can be processed
   * @param {Object} paymentData - Payment details
   * @param {number} senderId - Sender user ID
   * @param {string} recipientTag - Recipient @tag
   * @param {number} amount - Amount in USD
   * @param {string} asset - Asset type (xlm, usdc, etc.)
   * @returns {Promise<Object>} Validation result with details
   */
  async validatePayment(paymentData) {
    const { senderId, recipientTag, amount, asset = "xlm", memo = null } = paymentData;

    // Validate amount format
    const amountBN = new BigNumber(amount);
    if (amountBN.isNaN() || amountBN.lte(0)) {
      throw new Error("Invalid payment amount");
    }

    // Check minimum and maximum amounts
    if (amountBN.lt(PAYMENT_LIMITS.minAmount)) {
      throw new Error(`Minimum payment amount is $${PAYMENT_LIMITS.minAmount}`);
    }

    if (amountBN.gt(PAYMENT_LIMITS.maxAmount)) {
      throw new Error(`Maximum payment amount is $${PAYMENT_LIMITS.maxAmount}`);
    }

    // Validate memo
    if (memo && memo.length > STELLAR_CONFIG.maxMemoLength) {
      throw new Error(`Memo must be ${STELLAR_CONFIG.maxMemoLength} characters or less`);
    }

    // Resolve recipient
    const recipientData = await this.resolveTag(recipientTag);
    if (!recipientData.user) {
      throw new Error(`Recipient @${recipientTag} not found or has no Stellar account`);
    }

    // Prevent self-payment
    if (senderId === recipientData.user.id) {
      throw new Error("Cannot send payment to yourself");
    }

    // Check sender has sufficient balance
    const senderBalance = await Balance.findByUserIdAndTokenId(
      senderId,
      (await this.getTokenIdBySymbol(asset)) || null
    );

    if (!senderBalance || amountBN.gt(senderBalance.usd_value)) {
      throw new Error("Insufficient balance for payment");
    }

    // Check daily limits
    const dailySpent = await this.getDailySpent(senderId);
    const totalWithPayment = new BigNumber(dailySpent).plus(amountBN);

    if (totalWithPayment.gt(PAYMENT_LIMITS.dailyLimit)) {
      throw new Error(
        `Daily limit exceeded. Remaining today: $${new BigNumber(PAYMENT_LIMITS.dailyLimit)
          .minus(dailySpent)
          .toFixed(2)}`
      );
    }

    // Check transaction count
    const dailyTransactionCount = await this.getDailyTransactionCount(senderId);
    if (dailyTransactionCount >= PAYMENT_LIMITS.maxTransactionsPerDay) {
      throw new Error(
        `Daily transaction limit (${PAYMENT_LIMITS.maxTransactionsPerDay}) reached`
      );
    }

    return {
      valid: true,
      sender: await User.findById(senderId),
      recipient: recipientData.user,
      recipientAddress: recipientData.stellarAddress,
      amount: amountBN,
      asset,
      memo,
    };
  }

  /**
   * Calculate transaction fees
   * @param {BigNumber} amount - Transaction amount in USD
   * @returns {Object} Fee calculation details
   */
  calculateFees(amount) {
    const amountBN = new BigNumber(amount);

    // Calculate percentage fee
    const percentageFeeAmount = amountBN.multipliedBy(FEE_STRUCTURE.percentageFee);

    // Total fee is the max of percentage fee and minimum fixed fee, but capped at max fixed fee
    const totalFee = BigNumber.max(
      percentageFeeAmount,
      FEE_STRUCTURE.minFixedFee
    ).minimum(FEE_STRUCTURE.maxFixedFee);

    return {
      percentageRate: FEE_STRUCTURE.percentageFee,
      percentageAmount: percentageFeeAmount.toFixed(2),
      fixedMinimum: FEE_STRUCTURE.minFixedFee,
      fixedMaximum: FEE_STRUCTURE.maxFixedFee,
      totalFee: totalFee.toFixed(2),
      netAmount: amountBN.minus(totalFee).toFixed(2),
      totalDebit: amountBN.toFixed(2),
    };
  }

  /**
   * Get token ID by symbol
   * @param {string} symbol - Token symbol (xlm, usdc, etc.)
   * @returns {Promise<number>} Token ID
   */
  async getTokenIdBySymbol(symbol) {
    try {
      const token = await db("tokens").where({ symbol: symbol.toUpperCase() }).first();
      return token ? token.id : null;
    } catch (error) {
      console.error("Error fetching token:", error);
      return null;
    }
  }

  /**
   * Get daily spent amount for user
   * @param {number} userId - User ID
   * @returns {Promise<number>} Total USD spent today
   */
  async getDailySpent(userId) {
    try {
      const result = await db("transactions")
        .where("user_id", userId)
        .where("type", "debit")
        .where("status", "completed")
        .whereRaw("DATE(created_at) = CURRENT_DATE")
        .sum("usd_value as total");

      return result[0]?.total || 0;
    } catch (error) {
      console.error("Error calculating daily spent:", error);
      return 0;
    }
  }

  /**
   * Get daily transaction count for user
   * @param {number} userId - User ID
   * @returns {Promise<number>} Number of transactions today
   */
  async getDailyTransactionCount(userId) {
    try {
      const result = await db("transactions")
        .where("user_id", userId)
        .whereRaw("DATE(created_at) = CURRENT_DATE")
        .count("* as count");

      return result[0]?.count || 0;
    } catch (error) {
      console.error("Error counting daily transactions:", error);
      return 0;
    }
  }

  /**
   * Process a @tag-to-@tag payment on Stellar network
   * This is the main payment processing method
   * @param {Object} paymentData - Payment details
   * @returns {Promise<Object>} Transaction record
   */
  async processPayment(paymentData) {
    let transaction = null;

    try {
      // Validate payment
      const validationResult = await this.validatePayment(paymentData);

      // Calculate fees
      const feeCalculation = this.calculateFees(validationResult.amount);

      // Create transaction record with pending status
      transaction = await Transaction.create({
        user_id: paymentData.senderId,
        token_id: await this.getTokenIdBySymbol(validationResult.asset),
        chain_id: await this.getChainIdByNetwork("stellar"),
        reference: this.generateReference(),
        type: "debit",
        action: "payment",
        amount: validationResult.amount.toFixed(7), // XLM decimals
        usd_value: validationResult.amount.toFixed(2),
        from_address: validationResult.sender.address,
        to_address: validationResult.recipientAddress,
        description: `Payment to @${validationResult.recipient.tag}${
          paymentData.memo ? ` - ${paymentData.memo}` : ""
        }`,
        status: "pending",
        extra: JSON.stringify({
          recipientTag: validationResult.recipient.tag,
          recipientId: validationResult.recipient.id,
          fees: feeCalculation,
          asset: validationResult.asset,
          memo: validationResult.memo,
          processed_at: new Date().toISOString(),
        }),
      });

      // Deduct amount from sender's balance
      await this.deductBalance(
        paymentData.senderId,
        await this.getTokenIdBySymbol(validationResult.asset),
        validationResult.amount.plus(feeCalculation.totalFee)
      );

      // Create corresponding credit transaction for recipient
      const creditTransaction = await Transaction.create({
        user_id: validationResult.recipient.id,
        token_id: await this.getTokenIdBySymbol(validationResult.asset),
        chain_id: await this.getChainIdByNetwork("stellar"),
        reference: transaction.reference, // Link to original transaction
        type: "credit",
        action: "payment_received",
        amount: validationResult.amount.toFixed(7),
        usd_value: new BigNumber(feeCalculation.netAmount).toFixed(2),
        from_address: validationResult.sender.address,
        to_address: validationResult.recipientAddress,
        description: `Payment from @${validationResult.sender.tag}${
          paymentData.memo ? ` - ${paymentData.memo}` : ""
        }`,
        status: "pending",
        extra: JSON.stringify({
          senderTag: validationResult.sender.tag,
          senderId: paymentData.senderId,
          fees: feeCalculation,
          asset: validationResult.asset,
          memo: validationResult.memo,
          processed_at: new Date().toISOString(),
        }),
      });

      // Credit recipient's balance
      await this.creditBalance(
        validationResult.recipient.id,
        await this.getTokenIdBySymbol(validationResult.asset),
        new BigNumber(feeCalculation.netAmount)
      );

      // Queue transaction for Stellar network submission
      await this.queueStellarTransaction({
        transactionId: transaction.id,
        senderAddress: validationResult.sender.address,
        recipientAddress: validationResult.recipientAddress,
        amount: validationResult.amount.toFixed(7),
        asset: validationResult.asset,
        memo: validationResult.memo,
        fees: feeCalculation,
      });

      // Return enriched transaction data
      return {
        id: transaction.id,
        reference: transaction.reference,
        status: "pending",
        sender: {
          id: validationResult.sender.id,
          tag: validationResult.sender.tag,
          address: validationResult.sender.address,
        },
        recipient: {
          id: validationResult.recipient.id,
          tag: validationResult.recipient.tag,
          address: validationResult.recipientAddress,
        },
        amount: validationResult.amount.toFixed(7),
        usd_value: validationResult.amount.toFixed(2),
        asset: validationResult.asset,
        fees: feeCalculation,
        memo: validationResult.memo,
        created_at: transaction.created_at,
        message: "Payment submitted to Stellar network. Awaiting confirmation.",
      };
    } catch (error) {
      // Mark transaction as failed if it was created
      if (transaction && transaction.id) {
        await Transaction.update(transaction.id, {
          status: "failed",
          description: `Failed: ${error.message}`,
        });
      }
      throw error;
    }
  }

  /**
   * Deduct amount from user's balance
   * @param {number} userId - User ID
   * @param {number} tokenId - Token ID
   * @param {BigNumber} amount - Amount to deduct
   */
  async deductBalance(userId, tokenId, amount) {
    try {
      const balance = await Balance.findByUserIdAndTokenId(userId, tokenId);
      if (!balance) {
        throw new Error("Balance not found");
      }

      const newBalance = new BigNumber(balance.usd_value).minus(amount);
      if (newBalance.lt(0)) {
        throw new Error("Insufficient balance");
      }

      await Balance.update(balance.id, {
        usd_value: newBalance.toFixed(2),
      });
    } catch (error) {
      throw new Error(`Failed to deduct balance: ${error.message}`);
    }
  }

  /**
   * Credit amount to user's balance
   * @param {number} userId - User ID
   * @param {number} tokenId - Token ID
   * @param {BigNumber} amount - Amount to credit
   */
  async creditBalance(userId, tokenId, amount) {
    try {
      let balance = await Balance.findByUserIdAndTokenId(userId, tokenId);

      if (!balance) {
        // Create new balance if doesn't exist
        balance = await Balance.create({
          user_id: userId,
          token_id: tokenId,
          usd_value: amount.toFixed(2),
          address: "", // Will be set by wallet setup
        });
      } else {
        const newBalance = new BigNumber(balance.usd_value).plus(amount);
        await Balance.update(balance.id, {
          usd_value: newBalance.toFixed(2),
        });
      }
    } catch (error) {
      throw new Error(`Failed to credit balance: ${error.message}`);
    }
  }

  /**
   * Get chain ID by network name
   * @param {string} network - Network name (stellar, eth, etc.)
   * @returns {Promise<number>} Chain ID
   */
  async getChainIdByNetwork(network) {
    try {
      const chain = await db("chains").where({ symbol: network.toUpperCase() }).first();
      return chain ? chain.id : null;
    } catch (error) {
      console.error("Error fetching chain:", error);
      return null;
    }
  }

  /**
   * Generate a unique transaction reference
   * @returns {string} Transaction reference
   */
  generateReference() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `PAY-${timestamp}-${random}`.toUpperCase();
  }

  /**
   * Queue transaction for Stellar network submission
   * This would typically use a job queue (Bull, RabbitMQ, etc.)
   * @param {Object} stellarTxData - Stellar transaction data
   */
  async queueStellarTransaction(stellarTxData) {
    try {
      // Store in Redis for processing by worker
      const key = `stellar:pending:${stellarTxData.transactionId}`;
      await redis.setex(
        key,
        86400, // 24 hour expiry
        JSON.stringify(stellarTxData)
      );

      // Emit event for async processing
      console.log(`Queued Stellar transaction: ${stellarTxData.transactionId}`);
    } catch (error) {
      console.error("Failed to queue Stellar transaction:", error);
      // Don't throw here - transaction is already recorded, will retry
    }
  }

  /**
   * Get transaction history for a user
   * @param {number} userId - User ID
   * @param {Object} options - Query options (limit, offset, filters)
   * @returns {Promise<Array>} Transaction records
   */
  async getTransactionHistory(userId, options = {}) {
    try {
      const { limit = 20, offset = 0, type = null, status = null } = options;

      let query = db("transactions")
        .select(
          "transactions.*",
          "users.tag as user_tag",
          "tokens.symbol as token_symbol"
        )
        .leftJoin("users", "transactions.user_id", "users.id")
        .leftJoin("tokens", "transactions.token_id", "tokens.id")
        .where("transactions.user_id", userId);

      if (type) {
        query = query.where("transactions.type", type);
      }

      if (status) {
        query = query.where("transactions.status", status);
      }

      const transactions = await query
        .orderBy("transactions.created_at", "desc")
        .limit(limit)
        .offset(offset);

      return transactions.map((tx) => this.enrichTransaction(tx));
    } catch (error) {
      throw new Error(`Failed to fetch transaction history: ${error.message}`);
    }
  }

  /**
   * Enrich transaction with parsed extra data
   * @param {Object} transaction - Transaction record
   * @returns {Object} Enriched transaction
   */
  enrichTransaction(transaction) {
    try {
      if (transaction.extra && typeof transaction.extra === "string") {
        transaction.extra = JSON.parse(transaction.extra);
      }
      return transaction;
    } catch (error) {
      console.error("Error enriching transaction:", error);
      return transaction;
    }
  }

  /**
   * Verify payment was processed successfully
   * @param {string} transactionReference - Payment reference
   * @returns {Promise<Object>} Updated transaction status
   */
  async verifyPayment(transactionReference) {
    try {
      const transaction = await db("transactions")
        .where("reference", transactionReference)
        .first();

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      return this.enrichTransaction(transaction);
    } catch (error) {
      throw new Error(`Failed to verify payment: ${error.message}`);
    }
  }
}

export default new PaymentService();
