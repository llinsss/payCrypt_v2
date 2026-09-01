import axios from 'axios';
import crypto from 'crypto';
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
   * Verify a Monnify webhook signature.
   *
   * Monnify signs the exact raw bytes of the request body with SHA-512 HMAC
   * using the merchant's secret key, and sends the hex digest in the
   * `monnify-signature` header. The hash MUST be computed over the raw
   * request bytes — re-serializing the parsed JSON body (via
   * `JSON.stringify`) is not guaranteed to reproduce the exact bytes Monnify
   * signed (key order, whitespace, number formatting can all differ), which
   * would make a legitimate webhook fail verification. Callers should pass
   * `req.rawBody` (captured by the raw-body middleware applied to every JSON
   * route — see middleware/payloadLimits.js) rather than the parsed body.
   *
   * @param {string} signature - value of the `monnify-signature` header
   * @param {Buffer|string|Object} rawBody - the raw request body (preferred),
   *   or the parsed body as a fallback if the raw bytes are unavailable
   * @returns {boolean}
   */
  verifyWebhookSignature(signature, rawBody) {
    if (!signature || !this.secretKey || rawBody == null) {
      return false;
    }

    const payload = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(
          typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
        );

    const expected = crypto
      .createHmac('sha512', this.secretKey)
      .update(payload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(String(signature), 'utf8');

    // Lengths must match before timingSafeEqual — it throws on mismatched
    // buffer lengths rather than returning false.
    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  }
}

export default new MonnifyService();
