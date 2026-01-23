import { BaseResource } from './base';
import type {
  Transaction,
  TransactionListApiResponse,
  TransactionApiResponse,
  TransactionsByTagOptions,
  PaginationInfo,
} from '../types';

/**
 * Transactions resource for viewing transaction history
 *
 * @example
 * ```typescript
 * // List user's transactions
 * const transactions = await client.transactions.list();
 *
 * // Get transaction by ID
 * const tx = await client.transactions.getById('tx123');
 *
 * // Get transactions by tag
 * const tagTxs = await client.transactions.getByTag('john_lagos', {
 *   limit: 10,
 *   type: 'transfer'
 * });
 * ```
 */
export class TransactionsResource extends BaseResource {
  /**
   * Extract transactions array from various response formats
   */
  private extractTransactions(response: TransactionListApiResponse): Transaction[] {
    // Check if it's a raw array
    if (Array.isArray(response)) {
      return response;
    }
    // Check if it's a wrapped response with 'data' field
    if ('data' in response && Array.isArray(response.data)) {
      return response.data;
    }
    // Check if it's a wrapped response with 'transactions' field
    if ('transactions' in response && Array.isArray(response.transactions)) {
      return response.transactions;
    }
    return [];
  }

  /**
   * Extract single transaction from various response formats
   */
  private extractTransaction(response: TransactionApiResponse): Transaction {
    // Check if it's a wrapped response
    if ('data' in response && response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
      return response.data;
    }
    // Check if it's a direct transaction object (has id and type)
    if ('id' in response && 'type' in response) {
      return response as Transaction;
    }
    throw new Error('Transaction not found');
  }

  /**
   * Extract pagination from response
   */
  private extractPagination(response: TransactionListApiResponse): PaginationInfo | undefined {
    if (!Array.isArray(response) && 'pagination' in response) {
      return response.pagination;
    }
    return undefined;
  }

  /**
   * List user's transactions
   *
   * @returns Array of transactions
   */
  async list(): Promise<Transaction[]> {
    const response = await this.http.get<TransactionListApiResponse>(
      '/api/transactions/'
    );
    return this.extractTransactions(response);
  }

  /**
   * Get transaction by ID
   *
   * @param id - Transaction ID
   * @returns Transaction information
   */
  async getById(id: string | number): Promise<Transaction> {
    const response = await this.http.get<TransactionApiResponse>(
      `/api/transactions/${id}`
    );
    return this.extractTransaction(response);
  }

  /**
   * Get transactions by tag with optional filters
   *
   * @param tag - The tag to get transactions for
   * @param options - Filter and pagination options
   * @returns Array of transactions with pagination info
   */
  async getByTag(
    tag: string,
    options?: TransactionsByTagOptions
  ): Promise<{ data: Transaction[]; pagination?: PaginationInfo }> {
    const normalizedTag = this.normalizeTag(tag);
    const response = await this.http.get<TransactionListApiResponse>(
      `/api/transactions/tag/${normalizedTag}`,
      {
        params: {
          limit: options?.limit,
          offset: options?.offset,
          from: options?.from,
          to: options?.to,
          type: options?.type,
          sortBy: options?.sortBy,
          sortOrder: options?.sortOrder,
        },
      }
    );

    return {
      data: this.extractTransactions(response),
      pagination: this.extractPagination(response),
    };
  }
}
