// Main client export
export { TaggedSDK } from './client';

// Resource exports
export { AuthResource } from './resources/auth';
export { TransactionsResource } from './resources/transactions';
export { BalancesResource } from './resources/balances';
export { TagsResource } from './resources/tags';
export { WebhooksResource } from './resources/webhooks';

// Error exports
export {
  TaggedError,
  ApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  NetworkError,
  ConfigurationError,
} from './utils/errors';

// Type exports
export type {
  // Configuration
  TaggedSDKConfig,

  // Auth
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  User,

  // Balances
  Balance,
  BalanceResponse,

  // Transactions
  Transaction,
  TransactionListResponse,
  SendPaymentRequest,
  ScheduledPayment,
  CreateScheduledPaymentRequest,

  // Tags
  TagInfo,
  ResolveTagResponse,

  // Webhooks
  Webhook,
  CreateWebhookRequest,
  WebhookEvent,

  // Common
  PaginationInfo,
  ApiResponse,
  ListResponse,
} from './types';
