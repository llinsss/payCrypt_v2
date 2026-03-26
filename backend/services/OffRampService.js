import db from "../config/database.js";
import Withdrawal from "../models/Withdrawal.js";
import Balance from "../models/Balance.js";
import BankAccount from "../models/BankAccount.js";
import Token from "../models/Token.js";
import PaystackService from "./PaystackService.js";
import MonnifyService from "./MonnifyService.js";
import ExchangeRateService from "./exchange-rate-api.js";
import { publish } from "../config/redis.js";

class OffRampService {
  /**
   * Orchestrate a withdrawal from crypto to fiat bank account
   * @param {Object} params { userId, tokenId, bankAccountId, amountCrypto }
   * @returns {Promise<Object>} Withdrawal record
   */
  async initiateWithdrawal({ userId, tokenId, bankAccountId, amountCrypto }) {
    const trx = await db.transaction();

    try {
      // 1. Validate inputs and fetch entities
      const [bankAccount, token, balance] = await Promise.all([
        BankAccount.findById(bankAccountId),
        Token.findById(tokenId),
        Balance.findByUserIdAndTokenId(userId, tokenId)
      ]);

      if (!bankAccount || bankAccount.user_id !== userId) {
        throw new Error("Invalid bank account");
      }
      if (!token) throw new Error("Invalid token");
      if (!balance || parseFloat(balance.amount) < amountCrypto) {
        throw new Error("Insufficient balance");
      }

      // 2. Calculate conversion and fees
      const rates = await ExchangeRateService.getRates();
      const ngnRate = rates.NGN || 1600; // Fallback if NGN not in rates
      const tokenPriceUsd = token.price || 0;
      
      const amountUsd = amountCrypto * tokenPriceUsd;
      const amountFiat = amountUsd * ngnRate;
      
      // Fee: 1% of fiat amount, min 50 NGN
      const fee = Math.max(amountFiat * 0.01, 50);
      const netAmountFiat = amountFiat - fee;

      if (netAmountFiat <= 0) {
        throw new Error("Withdrawal amount too small to cover fees");
      }

      // 3. Create withdrawal record (pending) and debit crypto balance atomically
      const withdrawalData = {
        user_id: userId,
        token_id: tokenId,
        bank_account_id: bankAccountId,
        amount_crypto: amountCrypto,
        amount_fiat: netAmountFiat,
        currency: 'NGN',
        fee: fee,
        exchange_rate: ngnRate * tokenPriceUsd,
        provider: 'paystack', // Start with Paystack
        status: 'pending'
      };

      const withdrawal = await Withdrawal.create(withdrawalData, trx);
      await Balance.debit(balance.id, amountCrypto, trx);

      await trx.commit();

      // 4. Initiate transfer via Paystack (async, non-blocking for DB trx)
      this._processTransfer(withdrawal.id).catch(err => {
        console.error(`Background transfer processing failed for withdrawal ${withdrawal.id}:`, err.message);
      });

      return withdrawal;

    } catch (error) {
      await trx.rollback();
      console.error("Off-ramp initiation failed:", error.message);
      throw error;
    }
  }

  /**
   * Internal method to process the transfer via providers
   * @private
   */
  async _processTransfer(withdrawalId) {
    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) return;

    try {
      await Withdrawal.updateStatus(withdrawalId, 'processing', 'Initiating transfer via Paystack');

      // Try Paystack
      try {
        const recipientCode = await PaystackService.createTransferRecipient({
          name: withdrawal.account_name || withdrawal.user_tag,
          account_number: withdrawal.account_number,
          bank_code: withdrawal.bank_code
        });

        const transfer = await PaystackService.initiateTransfer({
          amount: withdrawal.amount_fiat,
          recipient: recipientCode,
          reference: `WTH-${withdrawal.id}-${Date.now()}`,
          reason: `Tagged Withdrawal - ${withdrawal.user_tag}`
        });

        await Withdrawal.update(withdrawalId, {
          provider: 'paystack',
          provider_reference: transfer.reference,
          transfer_code: transfer.transfer_code,
          status: 'processing',
          status_message: 'Paystack transfer initiated'
        });

        return;
      } catch (paystackError) {
        console.warn(`Paystack transfer failed for withdrawal ${withdrawalId}, falling back to Monnify:`, paystackError.message);
        
        // Fallback to Monnify
        const transfer = await MonnifyService.initiateDisbursement({
          amount: withdrawal.amount_fiat,
          reference: `WTH-MOC-${withdrawal.id}-${Date.now()}`,
          narration: `Tagged Withdrawal - ${withdrawal.user_tag}`,
          destinationBankCode: withdrawal.bank_code,
          destinationAccountNumber: withdrawal.account_number
        });

        await Withdrawal.update(withdrawalId, {
          provider: 'monnify',
          provider_reference: transfer.reference,
          status: 'processing',
          status_message: 'Monnify transfer initiated (Paystack fallback)'
        });
      }
    } catch (error) {
      console.error(`Off-ramp transfer failed for withdrawal ${withdrawalId}:`, error.message);
      await this._handleTransferFailure(withdrawalId, error.message);
    }
  }

  /**
   * Handle transfer failure: record error and refund crypto balance
   * @private
   */
  async _handleTransferFailure(withdrawalId, errorMessage) {
    const trx = await db.transaction();
    try {
      const withdrawal = await Withdrawal.findById(withdrawalId, trx);
      if (!withdrawal || withdrawal.status === 'failed' || withdrawal.status === 'reversed') {
        await trx.commit();
        return;
      }

      // 1. Update status to failed
      await Withdrawal.updateStatus(withdrawalId, 'failed', errorMessage, trx);

      // 2. Refund crypto balance
      const balance = await Balance.findByUserIdAndTokenId(withdrawal.user_id, withdrawal.token_id);
      if (balance) {
        await Balance.credit(balance.id, withdrawal.amount_crypto, trx);
        // Mark as reversed
        await Withdrawal.updateStatus(withdrawalId, 'reversed', `${errorMessage} (Refunded)`, trx);
      }

      await trx.commit();

      // 3. Notify user
      await publish('notifications:withdrawals', {
        userId: withdrawal.user_id,
        status: 'failed',
        amountCrypto: withdrawal.amount_crypto,
        symbol: withdrawal.token_symbol,
        message: `Withdrawal failed: ${errorMessage}. Funds have been refunded to your balance.`
      });

    } catch (error) {
      await trx.rollback();
      console.error(`Refund failed for withdrawal ${withdrawalId}:`, error.message);
    }
  }

  /**
   * Handle webhook status updates
   * @param {string} provider 'paystack' or 'monnify'
   * @param {Object} data Webhook data
   */
  async handleWebhook(provider, reference, status, details = {}) {
    const withdrawal = await Withdrawal.findByReference(reference);
    if (!withdrawal) return;

    if (status === 'success' || status === 'SUCCESSFUL') {
      await Withdrawal.updateStatus(withdrawal.id, 'completed', 'Funds delivered successfully');
      
      await publish('notifications:withdrawals', {
        userId: withdrawal.user_id,
        status: 'completed',
        amountFiat: withdrawal.amount_fiat,
        currency: withdrawal.currency,
        message: `Your withdrawal of ${withdrawal.amount_fiat} ${withdrawal.currency} has been delivered.`
      });
    } else if (status === 'failed' || status === 'FAILED' || status === 'reversed') {
      await this._handleTransferFailure(withdrawal.id, details.message || 'Transfer failed at provider');
    }
  }
}

export default new OffRampService();
