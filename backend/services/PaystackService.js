
import axios from 'axios';
import CircuitBreakerService from './CircuitBreakerService.js';

class PaystackService {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.baseUrl = 'https://api.paystack.co';
    this.axios = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create a transfer recipient on Paystack
   * @param {Object} recipientData { name, account_number, bank_code }
   * @returns {Promise<string>} recipient_code
   */
  async createTransferRecipient({ name, account_number, bank_code }) {
    return CircuitBreakerService.fire('paystack', async () => {
      try {
        const response = await this.axios.post('/transferrecipient', {
          type: 'nuban',
          name,
          account_number,
          bank_code,
          currency: 'NGN',
        });

        if (response.data.status) {
          return response.data.data.recipient_code;
        }
        throw new Error(response.data.message || 'Failed to create transfer recipient');
      } catch (error) {
        console.error('Paystack createTransferRecipient error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || error.message);
      }
    });
  }

  /**
   * Initiate a transfer on Paystack
   * @param {Object} transferData { amount, recipient, reference, reason }
   * @returns {Promise<Object>} transfer details
   */
  async initiateTransfer({ amount, recipient, reference, reason }) {
    return CircuitBreakerService.fire('paystack', async () => {
      try {
        // Amount in kobo for Paystack
        const amountInKobo = Math.round(amount * 100);

        const response = await this.axios.post('/transfer', {
          source: 'balance',
          amount: amountInKobo,
          recipient,
          reference,
          reason,
        });

        if (response.data.status) {
          return {
            transfer_code: response.data.data.transfer_code,
            reference: response.data.data.reference,
            status: response.data.data.status,
          };
        }
        throw new Error(response.data.message || 'Failed to initiate transfer');
      } catch (error) {
        console.error('Paystack initiateTransfer error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || error.message);
      }
    });
  }

  /**
   * Verify Paystack webhook signature
   * @param {string} signature
   * @param {Object} body
   * @returns {boolean}
   */
  verifyWebhookSignature(signature, body) {
    const crypto = require('crypto');
    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(JSON.stringify(body))
      .digest('hex');
    return hash === signature;
  }
}

export default new PaystackService();
