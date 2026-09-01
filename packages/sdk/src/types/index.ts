// ============ Configuration Types ============

export interface TaggedSDKConfig {
  baseUrl?: string;
  apiKey?: string;
  token?: string;
  timeout?: number;
}

// ============ Auth Types ============

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  tag: string;
  fullName?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface User {
  id: number;
  email: string;
  tag: string;
  fullName?: string;
  kycStatus?: string;
  createdAt: string;
}

// ============ Balance Types ============

export interface Balance {
  id: number;
  userId: number;
  tokenId: number;
  tokenSymbol: string;
  tokenName: string;
  chain: string;
  balance: string;
  usdValue: string;
  updatedAt: string;
}

export interface BalanceResponse {
  balances: Balance[];
  totalUsdValue: string;
}

// ============ Transaction Types ============

export interface Transaction {
  id: number;
  reference: string;
  type: 'debit' | 'credit';
  status: 'pending' | 'completed' | 'failed';
  amount: string;
  tokenSymbol: string;
  usdValue: string;
  senderTag?: string;
  recipientTag?: string;
  fee?: string;
  txHash?: string;
  memo?: string;
  createdAt: string;
}

export interface SendPaymentRequest {
  recipientTag: string;
  amount: string;
  asset: string;
  assetIssuer?: string;
  memo?: string;
  tokenId?: number;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  pagination: PaginationInfo;
}

// ============ Tag Types ============

export interface TagInfo {
  tag: string;
  userId: number;
  displayName?: string;
  avatarUrl?: string;
  isActive: boolean;
}

export interface ResolveTagResponse {
  tag: string;
  exists: boolean;
  user?: TagInfo;
}

// ============ Webhook Types ============

export interface Webhook {
  id: number;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface CreateWebhookRequest {
  url: string;
  events: string[];
  secret?: string;
}

export interface WebhookEvent {
  id: number;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

// ============ Common Types ============

export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ListResponse<T> {
  data: T[];
  pagination: PaginationInfo;
}

export interface ScheduledPayment {
  id: number;
  userId: number;
  senderTag: string;
  recipientTag: string;
  amount: string;
  asset: string;
  frequency: 'once' | 'daily' | 'weekly' | 'monthly';
  status: 'pending' | 'paused' | 'completed' | 'cancelled' | 'failed';
  scheduledAt: string;
  nextRunAt?: string;
  memo?: string;
  createdAt: string;
}

export interface CreateScheduledPaymentRequest {
  recipientTag: string;
  amount: string;
  asset: string;
  scheduledAt: string;
  frequency?: 'once' | 'daily' | 'weekly' | 'monthly';
  assetIssuer?: string;
  memo?: string;
  maxExecutions?: number;
}
