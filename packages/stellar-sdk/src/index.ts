// Main client export
export { TaggedStellar } from './client';

// Resource exports
export { AccountsResource } from './resources/accounts';
export { PaymentsResource } from './resources/payments';
export { BalancesResource } from './resources/balances';
export { TransactionsResource } from './resources/transactions';

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
  TimeoutError,
  ConfigurationError,
} from './utils/errors';

// Type exports
export type {
  // Configuration types
  TaggedStellarConfig,
  HttpClientConfig,
  RequestOptions,

  // Account types
  Account,
  AccountApiResponse,
  CreateAccountRequest,
  TransferTagRequest,

  // Balance types
  Balance,
  BalanceApiResponse,
  SingleBalanceApiResponse,

  // Payment types
  SendToTagRequest,
  SendToWalletRequest,
  PaymentResult,
  PaymentApiResponse,

  // Transaction types
  Transaction,
  TransactionType,
  TransactionStatus,
  TransactionApiResponse,
  TransactionListApiResponse,
  TransactionsByTagOptions,

  // Wallet types
  Wallet,
  WalletApiResponse,

  // Common types
  PaginationOptions,
  PaginationInfo,
  ApiResponse,
  ListResponse,
} from './types';
