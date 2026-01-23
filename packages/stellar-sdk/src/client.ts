import { HttpClient } from './utils/http';
import { ConfigurationError } from './utils/errors';
import { AccountsResource } from './resources/accounts';
import { PaymentsResource } from './resources/payments';
import { BalancesResource } from './resources/balances';
import { TransactionsResource } from './resources/transactions';
import type { TaggedPayStellarConfig } from './types';

/**
 * TaggedPay Stellar SDK Client
 *
 * The main entry point for interacting with the TaggedPay Stellar API.
 *
 * @example
 * ```typescript
 * import { TaggedPayStellar } from '@taggedpay/stellar-sdk';
 *
 * const client = new TaggedPayStellar({
 *   apiKey: 'your-api-key',
 *   baseUrl: 'https://api.taggedpay.xyz'
 * });
 *
 * // Create an account
 * await client.accounts.create({ tag: 'john_lagos', stellarAddress: 'GABCD...' });
 *
 * // Send a payment
 * await client.payments.send({ to: '@jane', amount: 100, balanceId: 1 });
 *
 * // Get balances
 * const balances = await client.balances.get();
 *
 * // List transactions
 * const transactions = await client.transactions.list();
 * ```
 */
export class TaggedPayStellar {
  private readonly http: HttpClient;

  /**
   * Accounts resource for managing tags and Stellar addresses
   */
  public readonly accounts: AccountsResource;

  /**
   * Payments resource for sending funds
   */
  public readonly payments: PaymentsResource;

  /**
   * Balances resource for managing account balances
   */
  public readonly balances: BalancesResource;

  /**
   * Transactions resource for viewing transaction history
   */
  public readonly transactions: TransactionsResource;

  /**
   * Create a new TaggedPayStellar client instance
   *
   * @param config - Client configuration options
   * @throws ConfigurationError if required configuration is missing
   */
  constructor(config: TaggedPayStellarConfig) {
    // Validate required configuration
    if (!config.apiKey) {
      throw new ConfigurationError('API key is required');
    }

    // Initialize HTTP client
    this.http = new HttpClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      timeout: config.timeout,
      retries: config.retries,
      retryDelay: config.retryDelay,
      retryBackoffMultiplier: config.retryBackoffMultiplier,
    });

    // Initialize resources
    this.accounts = new AccountsResource(this.http);
    this.payments = new PaymentsResource(this.http);
    this.balances = new BalancesResource(this.http);
    this.transactions = new TransactionsResource(this.http);
  }

  /**
   * Update the API key used for authentication
   *
   * @param apiKey - New API key
   */
  public setApiKey(apiKey: string): void {
    if (!apiKey) {
      throw new ConfigurationError('API key is required');
    }
    this.http.setApiKey(apiKey);
  }

  /**
   * Get the current base URL
   *
   * @returns The base URL
   */
  public getBaseUrl(): string {
    return this.http.getBaseUrl();
  }
}
