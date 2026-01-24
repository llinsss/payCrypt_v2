import { BaseResource } from './base';
import { NotFoundError } from '../utils/errors';
import type {
  Account,
  AccountApiResponse,
  CreateAccountRequest,
  TransferTagRequest,
} from '../types';

/**
 * Accounts resource for managing tags and Stellar addresses
 *
 * @example
 * ```typescript
 * // Create a new account/tag
 * await client.accounts.create({
 *   tag: 'john_lagos',
 *   stellarAddress: 'GABCD...'
 * });
 *
 * // Get account by tag
 * const account = await client.accounts.get('john_lagos');
 *
 * // Transfer tag to new address
 * await client.accounts.transfer('john_lagos', {
 *   newStellarAddress: 'GXYZ...'
 * });
 * ```
 */
export class AccountsResource extends BaseResource {
  /**
   * Extract account data from various response formats
   */
  private extractAccount(response: AccountApiResponse | Account): Account {
    // Check if it's a wrapped response
    if ('data' in response && response.data) {
      return response.data;
    }
    // Check if it's a direct account object (has stellarAddress or tag)
    if ('stellarAddress' in response || 'tag' in response) {
      return response as Account;
    }
    throw new Error('Invalid response format');
  }

  /**
   * Create a new account by registering a tag with a Stellar address
   *
   * @param request - Account creation request
   * @returns The created account
   */
  async create(request: CreateAccountRequest): Promise<Account> {
    const response = await this.http.post<AccountApiResponse>('/api/tags/', {
      tag: this.normalizeTag(request.tag),
      stellarAddress: request.stellarAddress,
    });

    return this.extractAccount(response);
  }

  /**
   * Get account information by tag
   *
   * @param tag - The tag to look up (with or without @ prefix)
   * @returns Account information
   */
  async get(tag: string): Promise<Account> {
    const normalizedTag = this.normalizeTag(tag);
    const response = await this.http.get<AccountApiResponse>(
      `/api/tags/${normalizedTag}`
    );

    return this.extractAccount(response);
  }

  /**
   * Transfer tag ownership to a new Stellar address
   *
   * @param tag - The tag to transfer
   * @param request - Transfer request with new address
   * @returns Updated account information
   */
  async transfer(tag: string, request: TransferTagRequest): Promise<Account> {
    const normalizedTag = this.normalizeTag(tag);
    const response = await this.http.put<AccountApiResponse>(
      `/api/tags/${normalizedTag}/transfer`,
      request
    );

    return this.extractAccount(response);
  }

  /**
   * Check if a tag exists
   *
   * Note: Only returns false for NotFoundError. Other errors (network, auth, rate limit)
   * are re-thrown to avoid masking real problems.
   *
   * @param tag - The tag to check
   * @returns True if the tag exists
   * @throws NetworkError, AuthenticationError, RateLimitError, etc. for non-404 errors
   */
  async exists(tag: string): Promise<boolean> {
    try {
      await this.get(tag);
      return true;
    } catch (error) {
      // Only treat NotFoundError as "doesn't exist"
      // Re-throw all other errors (network, auth, rate limit, etc.)
      if (error instanceof NotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Resolve a tag to its Stellar address
   *
   * @param tag - The tag to resolve
   * @returns The Stellar address
   */
  async resolve(tag: string): Promise<string> {
    const account = await this.get(tag);
    return account.stellarAddress;
  }
}
