import { HttpClient } from './utils/http';
import { TaggedSDKConfig } from './types';
import { AuthResource } from './resources/auth';
import { TransactionsResource } from './resources/transactions';
import { BalancesResource } from './resources/balances';
import { TagsResource } from './resources/tags';
import { WebhooksResource } from './resources/webhooks';

const DEFAULT_BASE_URL = 'https://paycryptv2-production.up.railway.app/api';

export class TaggedSDK {
  readonly auth: AuthResource;
  readonly transactions: TransactionsResource;
  readonly balances: BalancesResource;
  readonly tags: TagsResource;
  readonly webhooks: WebhooksResource;

  private http: HttpClient;
  private refreshTokenHandler: (() => Promise<string | null>) | null = null;

  constructor(config: TaggedSDKConfig = {}) {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

    this.http = new HttpClient({
      baseUrl,
      apiKey: config.apiKey,
      token: config.token,
      timeout: config.timeout || 30000,
    });

    this.auth = new AuthResource(this.http);
    this.transactions = new TransactionsResource(this.http);
    this.balances = new BalancesResource(this.http);
    this.tags = new TagsResource(this.http);
    this.webhooks = new WebhooksResource(this.http);
  }

  /** Set an automatic JWT refresh handler for transparent token renewal */
  setRefreshTokenHandler(handler: () => Promise<string | null>): void {
    this.refreshTokenHandler = handler;
    this.http.setRefreshTokenHandler(handler);
  }

  /** Manually set the auth token (e.g., restore from storage) */
  setToken(token: string): void {
    this.http.setToken(token);
  }
}
