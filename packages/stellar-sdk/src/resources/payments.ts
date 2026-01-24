import { BaseResource } from './base';
import type {
  PaymentApiResponse,
  PaymentResult,
  SendToTagRequest,
  SendToWalletRequest,
} from '../types';

/**
 * Payments resource for sending funds
 *
 * @example
 * ```typescript
 * // Send to a tag
 * await client.payments.send({
 *   to: '@jane',
 *   amount: 100,
 *   balanceId: 1
 * });
 *
 * // Send to a wallet address
 * await client.payments.sendToWallet({
 *   address: 'GABCD...',
 *   amount: 50,
 *   balanceId: 1
 * });
 * ```
 */
export class PaymentsResource extends BaseResource {
  /**
   * Extract payment result from various response formats
   * Backend returns: { data: 'success', txHash: '...' }
   */
  private extractPaymentResult(response: PaymentApiResponse): PaymentResult {
    const result: PaymentResult = {};

    // Extract txHash from top level or nested
    if ('txHash' in response && response.txHash) {
      result.txHash = response.txHash;
    }

    // Extract data field
    if ('data' in response) {
      if (typeof response.data === 'string') {
        // Backend returns { data: 'success' }
        result.status = response.data === 'success' ? 'completed' : 'pending';
      } else if (typeof response.data === 'object' && response.data) {
        // Wrapped payment result
        return response.data;
      }
    }

    // Check status/success fields
    if ('status' in response && response.status === 'success') {
      result.status = 'completed';
    }
    if ('success' in response && response.success) {
      result.status = 'completed';
    }

    return result;
  }

  /**
   * Send payment to a tag
   *
   * @param request - Payment request details
   * @returns Payment result
   */
  async send(request: SendToTagRequest): Promise<PaymentResult> {
    const response = await this.http.post<PaymentApiResponse>(
      '/api/wallets/send-to-tag',
      {
        receiver_tag: this.normalizeTag(request.to),
        amount: request.amount,
        balance_id: request.balanceId,
      }
    );

    return this.extractPaymentResult(response);
  }

  /**
   * Send payment to a wallet address
   *
   * @param request - Payment request details
   * @returns Payment result
   */
  async sendToWallet(request: SendToWalletRequest): Promise<PaymentResult> {
    const response = await this.http.post<PaymentApiResponse>(
      '/api/wallets/send-to-wallet',
      {
        receiver_address: request.address,
        amount: request.amount,
        balance_id: request.balanceId,
      }
    );

    return this.extractPaymentResult(response);
  }
}
