// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration options for the TaggedStellar client
 */
export interface TaggedStellarConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for the API (default: https://api.taggedpay.xyz) */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Number of retries for failed requests (default: 3) */
  retries?: number;
  /** Initial delay between retries in milliseconds (default: 1000) */
  retryDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  retryBackoffMultiplier?: number;
}

/**
 * Internal HTTP client configuration
 */
export interface HttpClientConfig {
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  retryBackoffMultiplier?: number;
}

/**
 * Options for individual requests
 */
export interface RequestOptions {
  /** Query parameters */
  params?: Record<string, string | number | boolean | undefined>;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Override default timeout */
  timeout?: number;
  /** Override default retry count */
  retries?: number;
}

// ============================================================================
// Account Types
// ============================================================================

/**
 * Request to create a new account/tag
 */
export interface CreateAccountRequest {
  /** The tag name (e.g., "john_lagos") */
  tag: string;
  /** The Stellar public address */
  stellarAddress: string;
}

/**
 * Account information
 */
export interface Account {
  /** The tag name */
  tag: string;
  /** The Stellar public address */
  stellarAddress: string;
  /** Creation timestamp */
  createdAt?: string;
  /** Last update timestamp */
  updatedAt?: string;
}

/**
 * Raw API response for account operations (matches backend format)
 * Backend returns: { status: 'success', data: {...} }
 */
export interface AccountApiResponse {
  status?: string;
  success?: boolean;
  data?: Account;
  message?: string;
  error?: string;
}

/**
 * Request to transfer tag ownership
 */
export interface TransferTagRequest {
  /** New Stellar address to transfer the tag to */
  newStellarAddress: string;
}

// ============================================================================
// Balance Types
// ============================================================================

/**
 * Balance information
 */
export interface Balance {
  /** Balance ID */
  id: number;
  /** User ID */
  userId?: number;
  user_id?: number;
  /** Token ID */
  tokenId?: number;
  token_id?: number;
  /** Token name */
  token?: string;
  token_name?: string;
  /** Token symbol */
  symbol?: string;
  token_symbol?: string;
  /** Balance amount */
  amount: string | number;
  /** USD value of the balance */
  usdValue?: string | number;
  usd_value?: string | number;
  /** Wallet address */
  address?: string;
  /** User tag */
  tag?: string;
  user_tag?: string;
  /** User email */
  userEmail?: string;
  user_email?: string;
  /** Token logo URL */
  tokenLogoUrl?: string;
  token_logo_url?: string;
  /** Token price */
  tokenPrice?: string | number;
  token_price?: string | number;
  /** NGN value */
  ngnValue?: string | number;
  ngn_value?: string | number;
}

/**
 * Raw API response for balance operations
 * Backend may return raw array or wrapped response
 */
export type BalanceApiResponse = Balance[] | {
  status?: string;
  success?: boolean;
  data?: Balance[];
  message?: string;
  error?: string;
  pagination?: PaginationInfo;
};

/**
 * Raw API response for single balance
 */
export type SingleBalanceApiResponse = Balance | {
  status?: string;
  success?: boolean;
  data?: Balance;
  message?: string;
  error?: string;
};

/**
 * Pagination options for list operations
 */
export interface PaginationOptions {
  /** Number of items per page */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Pagination information in responses (matches backend format)
 */
export interface PaginationInfo {
  /** Total number of items */
  total: number;
  /** Items per page */
  limit: number;
  /** Current offset */
  offset: number;
  /** Whether there are more items */
  hasMore: boolean;
}

// ============================================================================
// Payment Types
// ============================================================================

/**
 * Request to send payment to a tag
 * Note: Sender is determined by authenticated user (req.user.id)
 */
export interface SendToTagRequest {
  /** Receiver's tag (e.g., "@jane") */
  to: string;
  /** Amount to send */
  amount: number | string;
  /** Balance ID to send from */
  balanceId: number;
}

/**
 * Request to send payment to a wallet address
 * Note: Sender is determined by authenticated user (req.user.id)
 */
export interface SendToWalletRequest {
  /** Receiver's wallet address */
  address: string;
  /** Amount to send */
  amount: number | string;
  /** Balance ID to send from */
  balanceId: number;
}

/**
 * Payment result
 */
export interface PaymentResult {
  /** Transaction ID */
  transactionId?: string;
  /** Transaction hash */
  txHash?: string;
  /** Transaction status */
  status?: 'pending' | 'completed' | 'failed';
  /** Amount sent */
  amount?: string | number;
  /** Sender information */
  from?: string;
  /** Recipient information */
  to?: string;
  /** Timestamp */
  timestamp?: string;
  /** Success message from backend */
  data?: string;
}

/**
 * Raw API response for payment operations
 * Backend returns: { data: 'success', txHash: '...' }
 */
export type PaymentApiResponse = {
  status?: string;
  success?: boolean;
  data?: string | PaymentResult;
  txHash?: string;
  message?: string;
  error?: string;
};

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Transaction type (includes all backend values)
 */
export type TransactionType = 'deposit' | 'withdrawal' | 'swap' | 'transfer' | 'debit' | 'credit';

/**
 * Transaction status
 */
export type TransactionStatus = 'pending' | 'completed' | 'failed';

/**
 * Transaction information
 */
export interface Transaction {
  /** Transaction ID */
  id: string | number;
  /** Unique reference */
  reference?: string;
  /** User ID */
  userId?: number;
  user_id?: number;
  /** Balance ID */
  balanceId?: number;
  balance_id?: number;
  /** Chain ID */
  chainId?: number;
  chain_id?: number;
  /** Transaction type */
  type: TransactionType;
  /** Amount */
  amount: string | number;
  /** USD value */
  usdValue?: string | number;
  usd_value?: string | number;
  /** Transaction status */
  status: TransactionStatus;
  /** Blockchain transaction hash */
  txHash?: string;
  tx_hash?: string;
  /** Timestamp */
  timestamp?: string;
  created_at?: string;
  /** From address */
  fromAddress?: string;
  from_address?: string;
  /** To address */
  toAddress?: string;
  to_address?: string;
  /** Description */
  description?: string;
  /** Token name */
  tokenName?: string;
  token_name?: string;
  /** Token symbol */
  tokenSymbol?: string;
  token_symbol?: string;
  /** Chain name */
  chainName?: string;
  chain_name?: string;
}

/**
 * Options for listing transactions by tag
 */
export interface TransactionsByTagOptions {
  /** Number of items per page */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Start date filter */
  from?: string;
  /** End date filter */
  to?: string;
  /** Transaction type filter */
  type?: TransactionType;
  /** Sort field */
  sortBy?: string;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Raw API response for transaction list operations
 * Backend may return raw array or wrapped response
 */
export type TransactionListApiResponse = Transaction[] | {
  status?: string;
  success?: boolean;
  data?: Transaction[];
  transactions?: Transaction[];
  message?: string;
  error?: string;
  pagination?: PaginationInfo;
};

/**
 * Raw API response for single transaction
 */
export type TransactionApiResponse = Transaction | {
  status?: string;
  success?: boolean;
  data?: Transaction;
  message?: string;
  error?: string;
};

// ============================================================================
// Wallet Types
// ============================================================================

/**
 * Wallet information
 */
export interface Wallet {
  /** Wallet ID */
  id: number;
  /** User ID */
  userId?: number;
  user_id?: number;
  /** Available balance */
  availableBalance?: number;
  available_balance?: number;
  /** Locked balance */
  lockedBalance?: number;
  locked_balance?: number;
  /** Creation timestamp */
  createdAt?: string;
  created_at?: string;
  /** Last update timestamp */
  updatedAt?: string;
  updated_at?: string;
}

/**
 * Raw API response for wallet operations
 */
export type WalletApiResponse = Wallet | {
  status?: string;
  success?: boolean;
  data?: Wallet;
  message?: string;
  error?: string;
};

// ============================================================================
// Generic Types
// ============================================================================

/**
 * Generic API response wrapper
 */
export interface ApiResponse<T> {
  status?: string;
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/**
 * Generic list response with pagination
 */
export interface ListResponse<T> {
  data: T[];
  pagination?: PaginationInfo;
}
