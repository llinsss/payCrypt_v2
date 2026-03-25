import * as StellarSdk from "@stellar/stellar-sdk";
import db from "../config/database.js";
import BatchPayment from "../models/BatchPayment.js";
import PaymentService from "./PaymentService.js";
import Token from "../models/Token.js";
import Transaction from "../models/Transaction.js";

const { TransactionBuilder, Operation, Asset, Keypair, Memo } = StellarSdk;

const STELLAR_ADDRESS_REGEX = /^G[A-Z0-9]{55}$/;
const STELLAR_CHAIN_ID = 6;
const STELLAR_BASE_FEE = 100;

const BATCH_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  PARTIAL_FAILED: "partial_failed",
  FAILED: "failed",
};

class BatchProcessingError extends Error {
  constructor(message, { results = [], statusCode = 400 } = {}) {
    super(message);
    this.name = "BatchProcessingError";
    this.results = results;
    this.statusCode = statusCode;
  }
}

class BatchPaymentService {
  async createBatchPayment({
    userId,
    senderTag,
    payments,
    atomic = true,
    asset = "XLM",
    assetIssuer = null,
    memo = null,
    senderSecret,
    additionalSecrets = [],
  }) {
    const normalizedAsset = asset || "XLM";
    const normalizedAssetIssuer = normalizedAsset === "XLM" ? null : assetIssuer;
    const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const batch = await BatchPayment.create({
      user_id: userId,
      reference: this.createBatchReference(),
      sender_tag: senderTag,
      asset: normalizedAsset,
      asset_issuer: normalizedAssetIssuer,
      memo: memo || null,
      atomic,
      status: BATCH_STATUS.PENDING,
      total_items: payments.length,
      processed_items: 0,
      successful_items: 0,
      failed_items: 0,
      total_amount: totalAmount,
      results: [],
    });

    try {
      const token = await Token.findBySymbol(normalizedAsset);
      if (!token) {
        throw new BatchProcessingError(`Token ${normalizedAsset} not found in database`);
      }

      const preparedBatch = await this.prepareBatch({
        senderTag,
        payments,
        asset: normalizedAsset,
        assetIssuer: normalizedAssetIssuer,
        token,
      });

      if (atomic) {
        return await this.processAtomicBatch({
          batch,
          preparedBatch,
          userId,
          senderTag,
          asset: normalizedAsset,
          assetIssuer: normalizedAssetIssuer,
          memo,
          secrets: [senderSecret, ...additionalSecrets],
        });
      }

      return await this.processNonAtomicBatch({
        batch,
        preparedBatch,
        userId,
        senderTag,
        asset: normalizedAsset,
        assetIssuer: normalizedAssetIssuer,
        memo,
        senderSecret,
        additionalSecrets,
      });
    } catch (error) {
      const failedBatch = await this.failBatch(
        batch.id,
        error.message,
        error.results && error.results.length > 0
          ? error.results
          : payments.map((payment, index) => this.buildFailedResult(index, payment, error.message))
      );

      return {
        success: false,
        httpStatus: this.getFailureStatusCode(error),
        message: error.message,
        data: failedBatch,
      };
    }
  }

  async getBatchStatus({ batchId, userId }) {
    return await BatchPayment.getDetailedByIdForUser(batchId, userId);
  }

  async prepareBatch({ senderTag, payments, asset, assetIssuer, token }) {
    const senderAddress = await PaymentService.resolveTag(senderTag);

    if (!STELLAR_ADDRESS_REGEX.test(senderAddress)) {
      throw new BatchProcessingError("Invalid sender Stellar address");
    }

    const validItems = [];
    const failures = [];

    for (const [index, payment] of payments.entries()) {
      try {
        const recipientAddress = await PaymentService.resolveTag(payment.recipientTag);
        if (!STELLAR_ADDRESS_REGEX.test(recipientAddress)) {
          throw new Error("Invalid recipient Stellar address");
        }

        if (recipientAddress === senderAddress) {
          throw new Error("Cannot send payment to yourself");
        }

        try {
          await PaymentService.server.loadAccount(recipientAddress);
        } catch (error) {
          throw new Error("Recipient account does not exist on Stellar network");
        }

        const amount = Number(payment.amount);
        const feeInfo = PaymentService.calculateFee(amount, asset);

        validItems.push({
          index,
          recipientTag: payment.recipientTag,
          recipientAddress,
          amount,
          notes: payment.notes || null,
          feeInfo,
          usdValue: amount * (token.price || 0),
          totalCost: amount + feeInfo.fee,
        });
      } catch (error) {
        failures.push(this.buildFailedResult(index, payment, error.message));
      }
    }

    return {
      senderAddress,
      validItems,
      failures,
      totalCost: validItems.reduce((sum, item) => sum + item.totalCost, 0),
      totalFees: validItems.reduce((sum, item) => sum + item.feeInfo.fee, 0),
      totalAmount: validItems.reduce((sum, item) => sum + item.amount, 0),
      token,
    };
  }

  async processAtomicBatch({
    batch,
    preparedBatch,
    userId,
    senderTag,
    asset,
    assetIssuer,
    memo,
    secrets,
  }) {
    const { senderAddress, validItems, failures, token, totalAmount, totalFees, totalCost } = preparedBatch;

    if (failures.length > 0) {
      throw new BatchProcessingError("Batch validation failed", {
        results: this.buildAtomicFailureResults(batch.total_items, validItems, failures),
      });
    }

    if (validItems.length === 0) {
      throw new BatchProcessingError("Batch validation failed", {
        results: [],
      });
    }

    const balance = await PaymentService.getBalance(senderAddress, asset, assetIssuer);
    if (balance < totalCost) {
      throw new BatchProcessingError(
        `Insufficient funds. Balance: ${balance} ${asset}, required: ${totalCost} ${asset}`,
        {
          results: validItems.map((item) =>
            this.buildFailedResult(item.index, item, `Insufficient funds. Balance: ${balance} ${asset}, required: ${totalCost} ${asset}`)
          ),
        }
      );
    }

    await BatchPayment.update(batch.id, { status: BATCH_STATUS.PROCESSING });

    const trx = await db.transaction();

    try {
      const transactionIds = [];

      for (const item of validItems) {
        const inserted = await trx("transactions").insert({
          user_id: userId,
          token_id: token.id,
          chain_id: STELLAR_CHAIN_ID,
          batch_id: batch.id,
          batch_item_index: item.index,
          reference: `${batch.reference}-${item.index + 1}`,
          type: "payment",
          status: "pending",
          amount: item.amount,
          usd_value: item.usdValue,
          from_address: senderAddress,
          to_address: item.recipientAddress,
          description: memo || `Batch payment from ${senderTag} to ${item.recipientTag}`,
          extra: JSON.stringify({
            fee: item.feeInfo.fee,
            baseFee: item.feeInfo.baseFee,
            networkFee: item.feeInfo.networkFee,
            asset,
            assetIssuer,
            senderTag,
            recipientTag: item.recipientTag,
            notes: item.notes,
            batchId: batch.id,
            batchReference: batch.reference,
            batchItemIndex: item.index,
            atomic: true,
          }),
        }).returning("id");

        transactionIds.push(Array.isArray(inserted) ? (inserted[0]?.id ?? inserted[0]) : inserted);
      }

      const signedXdr = await this.createAtomicBatchTransaction({
        senderAddress,
        validItems,
        asset,
        assetIssuer,
        memo,
        secrets,
      });

      const submitResult = await PaymentService.submitTransaction(signedXdr);

      for (const transactionId of transactionIds) {
        await trx("transactions")
          .where({ id: transactionId })
          .update({
            status: "completed",
            tx_hash: submitResult.hash,
            timestamp: submitResult.createdAt || new Date().toISOString(),
            updated_at: db.fn.now(),
          });
      }

      await trx.commit();

      const transactions = await Promise.all(transactionIds.map((id) => Transaction.findById(id)));
      const results = validItems.map((item, index) => ({
        index: item.index,
        recipientTag: item.recipientTag,
        amount: item.amount,
        notes: item.notes,
        status: "completed",
        fee: item.feeInfo.fee,
        transactionId: transactions[index]?.id,
        txHash: submitResult.hash,
        reference: transactions[index]?.reference,
      }));

      const updatedBatch = await BatchPayment.update(batch.id, {
        status: BATCH_STATUS.COMPLETED,
        processed_items: validItems.length,
        successful_items: validItems.length,
        failed_items: 0,
        total_amount: totalAmount,
        tx_hash: submitResult.hash,
        ledger: String(submitResult.ledger ?? ""),
        failure_reason: null,
        results,
        completed_at: db.fn.now(),
      });

      return {
        success: true,
        httpStatus: 201,
        message: "Batch payment processed successfully",
        data: {
          ...updatedBatch,
          transactions,
          total_fees: totalFees,
        },
      };
    } catch (error) {
      await trx.rollback();
      throw new BatchProcessingError(error.message, {
        statusCode: this.getFailureStatusCode(error),
        results: validItems.map((item) => this.buildFailedResult(item.index, item, error.message)),
      });
    }
  }

  async processNonAtomicBatch({
    batch,
    preparedBatch,
    userId,
    senderTag,
    asset,
    assetIssuer,
    memo,
    senderSecret,
    additionalSecrets,
  }) {
    const { senderAddress, validItems, failures } = preparedBatch;
    const results = Array(batch.total_items).fill(null);
    let successfulItems = 0;
    let failedItems = 0;
    let processedItems = 0;

    for (const failure of failures) {
      results[failure.index] = failure;
      failedItems += 1;
      processedItems += 1;
    }

    if (validItems.length === 0) {
      const failedBatch = await this.failBatch(batch.id, "Batch validation failed", results.filter(Boolean));

      return {
        success: false,
        httpStatus: 400,
        message: "Batch validation failed",
        data: failedBatch,
      };
    }

    let remainingBalance = await PaymentService.getBalance(senderAddress, asset, assetIssuer);

    await BatchPayment.update(batch.id, {
      status: BATCH_STATUS.PROCESSING,
      processed_items: processedItems,
      successful_items: successfulItems,
      failed_items: failedItems,
      results: results.filter(Boolean),
    });

    for (const item of validItems) {
      if (remainingBalance < item.totalCost) {
        results[item.index] = this.buildFailedResult(
          item.index,
          item,
          `Insufficient funds for batch item. Remaining balance: ${remainingBalance} ${asset}, required: ${item.totalCost} ${asset}`
        );
        failedItems += 1;
        processedItems += 1;

        await BatchPayment.update(batch.id, {
          processed_items: processedItems,
          successful_items: successfulItems,
          failed_items: failedItems,
          results: results.filter(Boolean),
          failure_reason: "One or more batch items failed",
        });

        continue;
      }

      try {
        const paymentResult = await PaymentService.processPayment({
          senderTag,
          recipientTag: item.recipientTag,
          amount: item.amount,
          asset,
          assetIssuer,
          memo,
          secrets: [senderSecret, ...additionalSecrets],
          userId,
        });

        const transaction = await Transaction.findById(paymentResult.transactionId);
        const existingExtra = transaction?.extra ? this.parseExtra(transaction.extra) : {};

        await Transaction.update(paymentResult.transactionId, {
          batch_id: batch.id,
          batch_item_index: item.index,
          extra: JSON.stringify({
            ...existingExtra,
            notes: item.notes,
            batchId: batch.id,
            batchReference: batch.reference,
            batchItemIndex: item.index,
            atomic: false,
          }),
        });

        results[item.index] = {
          index: item.index,
          recipientTag: item.recipientTag,
          amount: item.amount,
          notes: item.notes,
          status: "completed",
          fee: paymentResult.fee,
          transactionId: paymentResult.transactionId,
          txHash: paymentResult.txHash,
        };

        remainingBalance -= item.totalCost;
        successfulItems += 1;
      } catch (error) {
        results[item.index] = this.buildFailedResult(item.index, item, error.message);
        failedItems += 1;
      }

      processedItems += 1;

      await BatchPayment.update(batch.id, {
        processed_items: processedItems,
        successful_items: successfulItems,
        failed_items: failedItems,
        results: results.filter(Boolean),
        failure_reason: failedItems > 0 ? "One or more batch items failed" : null,
      });
    }

    const finalStatus = this.getFinalStatus(successfulItems, failedItems);
    const updatedBatch = await BatchPayment.update(batch.id, {
      status: finalStatus,
      processed_items: processedItems,
      successful_items: successfulItems,
      failed_items: failedItems,
      results: results.filter(Boolean),
      failure_reason: failedItems > 0 ? "One or more batch items failed" : null,
      completed_at: db.fn.now(),
    });

    return {
      success: finalStatus === BATCH_STATUS.COMPLETED,
      httpStatus: finalStatus === BATCH_STATUS.PARTIAL_FAILED ? 207 : finalStatus === BATCH_STATUS.COMPLETED ? 201 : 400,
      message: finalStatus === BATCH_STATUS.COMPLETED
        ? "Batch payment processed successfully"
        : finalStatus === BATCH_STATUS.PARTIAL_FAILED
          ? "Batch payment processed with partial failures"
          : "Batch payment failed",
      data: await BatchPayment.getDetailedByIdForUser(updatedBatch.id, userId),
    };
  }

  async createAtomicBatchTransaction({ senderAddress, validItems, asset, assetIssuer, memo, secrets }) {
    if (!secrets || secrets.length === 0) {
      throw new Error("At least one secret key is required for signing");
    }

    const multiSigInfo = await PaymentService.checkMultiSigRequirement(senderAddress);
    if (multiSigInfo.required && secrets.length < 2) {
      throw new Error(`Multi-signature account requires at least 2 signatures, but only ${secrets.length} provided`);
    }

    const senderAccount = await PaymentService.server.loadAccount(senderAddress);
    const transactionBuilder = new TransactionBuilder(senderAccount, {
      fee: String(STELLAR_BASE_FEE * validItems.length),
      networkPassphrase: PaymentService.networkPassphrase,
    });

    if (memo) {
      transactionBuilder.addMemo(Memo.text(memo));
    }

    const operationAsset = asset === "XLM" ? Asset.native() : new Asset(asset, assetIssuer);
    for (const item of validItems) {
      transactionBuilder.addOperation(
        Operation.payment({
          destination: item.recipientAddress,
          asset: operationAsset,
          amount: item.amount.toString(),
        })
      );
    }

    const transaction = transactionBuilder.setTimeout(30).build();
    const signedSecrets = new Set();

    for (const secret of secrets) {
      try {
        const keypair = Keypair.fromSecret(secret);
        transaction.sign(keypair);
        signedSecrets.add(keypair.publicKey());
      } catch (error) {
        throw new Error(`Invalid secret key: ${error.message}`);
      }
    }

    if (signedSecrets.size !== secrets.length) {
      throw new Error("Duplicate secret keys provided");
    }

    return transaction.toEnvelope().toXDR("base64");
  }

  async failBatch(batchId, message, results) {
    return await BatchPayment.update(batchId, {
      status: BATCH_STATUS.FAILED,
      processed_items: results.length,
      successful_items: 0,
      failed_items: results.length,
      failure_reason: message,
      results,
      completed_at: db.fn.now(),
    });
  }

  buildAtomicFailureResults(totalItems, validItems, failures) {
    const results = Array(totalItems).fill(null);

    for (const failure of failures) {
      results[failure.index] = failure;
    }

    for (const item of validItems) {
      results[item.index] = this.buildFailedResult(
        item.index,
        item,
        "Atomic batch processing requires every batch item to validate successfully"
      );
    }

    return results.filter(Boolean);
  }

  buildFailedResult(index, payment, error) {
    return {
      index,
      recipientTag: payment.recipientTag,
      amount: Number(payment.amount || 0),
      notes: payment.notes || null,
      status: "failed",
      error,
    };
  }

  createBatchReference() {
    return `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  getFinalStatus(successfulItems, failedItems) {
    if (successfulItems > 0 && failedItems > 0) {
      return BATCH_STATUS.PARTIAL_FAILED;
    }

    if (successfulItems > 0) {
      return BATCH_STATUS.COMPLETED;
    }

    return BATCH_STATUS.FAILED;
  }

  getFailureStatusCode(error) {
    if (error instanceof BatchProcessingError) {
      return error.statusCode;
    }

    if (error.message?.includes("not found")) {
      return 404;
    }

    if (error.message?.includes("Insufficient funds")) {
      return 402;
    }

    if (PaymentService._isNetworkError(error)) {
      return 503;
    }

    return 400;
  }

  parseExtra(extra) {
    try {
      return JSON.parse(extra);
    } catch (error) {
      return {};
    }
  }
}

export default new BatchPaymentService();
