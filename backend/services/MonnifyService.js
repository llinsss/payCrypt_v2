import axios from 'axios';
import CircuitBreakerService from './CircuitBreakerService.js';

class MonnifyService {
  constructor() {
    this.apiKey = process.env.MONNIFY_API_KEY;
    this.secretKey = process.env.MONNIFY_SECRET_KEY;
    this.contractCode = process.env.MONNIFY_CONTRACT_CODE;
    this.baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://api.monnify.com/api/v1' 
      : 'https://sandbox.monnify.com/api/v1';
    this.accessToken = null;
  }

  /**
   * Get authentication token from Monnify
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    return CircuitBreakerService.fire('monnify', async () => {
      try {
        const auth = Buffer.from(`${this.apiKey}:${this.secretKey}`).toString('base64');
        const response = await axios.post(`${this.baseUrl}/auth/login`, {}, {
          headers: {
            Authorization: `Basic ${auth}`,
          },
        });

        if (response.data.requestSuccessful) {
          this.accessToken = response.data.responseBody.accessToken;
          return this.accessToken;
        }
        throw new Error('Failed to get Monnify access token');
      } catch (error) {
        console.error('Monnify getAccessToken error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.responseMessage || 'Monnify auth failed');
      }
    });
  }

  /**
   * Initiate a disbursement on Monnify
   * @param {Object} disbursementData { amount, reference, narration, destinationBankCode, destinationAccountNumber }
   * @returns {Promise<Object>} disbursement details
   */
  async initiateDisbursement({ amount, reference, narration, destinationBankCode, destinationAccountNumber }) {
    return CircuitBreakerService.fire('monnify', async () => {
      try {
        if (!this.accessToken) await this.getAccessToken();

        const response = await axios.post(`${this.baseUrl}/disbursements/single`, {
          amount,
          reference,
          narration,
          destinationBankCode,
          destinationAccountNumber,
          currency: 'NGN',
          sourceAccountNumber: process.env.MONNIFY_SOURCE_ACCOUNT,
        }, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
          },
        });

        if (response.data.requestSuccessful) {
          return {
            reference: response.data.responseBody.reference,
            status: response.data.responseBody.status,
          };
        }
        throw new Error(response.data.responseMessage || 'Failed to initiate Monnify disbursement');
      } catch (error) {
        if (error.response?.status === 401) {
          this.accessToken = null;
          return this.initiateDisbursement({ amount, reference, narration, destinationBankCode, destinationAccountNumber });
        }
        console.error('Monnify initiateDisbursement error:', error.response?.data || error.message);
        throw new Error(error.response?.data?.responseMessage || error.message);
      }
    });
  }

  /**
   * Verify Monnify webhook signature
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

export default new MonnifyService();
