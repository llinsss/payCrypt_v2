import { BaseResource } from './base';
import type {
  Balance,
  BalanceApiResponse,
  SingleBalanceApiResponse,
  PaginationOptions,
  PaginationInfo,
} from '../types';

/**
 * Balances resource for managing account balances
 *
 * @example
 * ```typescript
 * // Get user's balances
 * const balances = await client.balances.get();
 *
 * // Get balance by ID
 * const balance = await client.balances.getById(1);
 *
 * // List all balances with pagination
 * const allBalances = await client.balances.list({ limit: 10, offset: 0 });
 *
 * // Sync on-chain balances
 * await client.balances.sync();
 * ```
 */
export class BalancesResource extends BaseResource {
  /**
   * Extract balance array from various response formats
   */
  private extractBalances(response: BalanceApiResponse): Balance[] {
    // Check if it's a raw array
    if (Array.isArray(response)) {
      return response;
    }
    // Check if it's a wrapped response
    if ('data' in response && Array.isArray(response.data)) {
      return response.data;
    }
    return [];
  }

  /**
   * Extract single balance from various response formats
   */
  private extractBalance(response: SingleBalanceApiResponse): Balance {
    // Check if it's a wrapped response
    if ('data' in response && response.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
      return response.data;
    }
    // Check if it's a direct balance object (has id and amount)
    if ('id' in response && 'amount' in response) {
      return response as Balance;
    }
    throw new Error('Balance not found');
  }

  /**
   * Extract pagination from response
   */
  private extractPagination(response: BalanceApiResponse): PaginationInfo | undefined {
    if (!Array.isArray(response) && 'pagination' in response) {
      return response.pagination;
    }
    return undefined;
  }

  /**
   * Get user's balances
   *
   * @returns Array of balances
   */
  async get(): Promise<Balance[]> {
    const response = await this.http.get<BalanceApiResponse>('/api/balances/');
    return this.extractBalances(response);
  }

  /**
   * Get balance by ID
   *
   * @param id - Balance ID
   * @returns Balance information
   */
  async getById(id: number): Promise<Balance> {
    const response = await this.http.get<SingleBalanceApiResponse>(
      `/api/balances/${id}`
    );
    return this.extractBalance(response);
  }

  /**
   * List all balances with pagination
   *
   * @param options - Pagination options (limit, offset)
   * @returns Array of balances with pagination info
   */
  async list(
    options?: PaginationOptions
  ): Promise<{ data: Balance[]; pagination?: PaginationInfo }> {
    const response = await this.http.get<BalanceApiResponse>(
      '/api/balances/all',
      {
        params: {
          limit: options?.limit,
          offset: options?.offset,
        },
      }
    );

    return {
      data: this.extractBalances(response),
      pagination: this.extractPagination(response),
    };
  }

  /**
   * Sync on-chain balances
   *
   * @returns Updated balances
   */
  async sync(): Promise<Balance[]> {
    const response = await this.http.get<BalanceApiResponse>(
      '/api/balances/sync'
    );
    return this.extractBalances(response);
  }
}
