export interface User {
  id: string;
  tag: string;
  walletAddress: string;
  isVerified: boolean;
  createdAt: string;
  totalDeposits: number;
  totalWithdrawals: number;
}

export interface Balance {
  token: string;
  symbol: string;
  amount: number;
  usdValue: number;
  chain: string;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'swap' | 'transfer';
  tag: string;
  token: string;
  amount: number;
  usdValue: number;
  status: 'pending' | 'completed' | 'failed';
  txHash?: string;
  chain: string;
  timestamp: string;
  fromAddress?: string;
  toAddress?: string;
}

export interface SwapQuote {
  fromToken: string;
  toToken: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  priceImpact: number;
  gasEstimate: number;
}

export interface FiatPayout {
  id: string;
  tag: string;
  amount: number;
  currency: 'NGN';
  provider: 'paystack' | 'monnify';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bankAccount: string;
  timestamp: string;
  requiresApproval?: boolean;
  approvedBy?: string;
  kycVerified?: boolean;
}

export interface Chain {
  id: string;
  name: string;
  symbol: string;
  rpcUrl: string;
  blockExplorer: string;
  nativeCurrency: string;
}

export interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl: string;
  chain: string;
  price: number;
}

export interface AuthUser {
  id: string;
  tag: string;
  email: string;
  walletAddress: string;
  isVerified: boolean;
  kycStatus: 'none' | 'pending' | 'verified' | 'rejected';
  createdAt: string;
  lastLogin: string;
  role: 'user' | 'admin';
}

export interface KYCData {
  fullName: string;
  phoneNumber: string;
  bankName: string;
  accountNumber: string;
  bvn?: string;
  idDocument?: File;
  proofOfAddress?: File;
}

export interface AdminStats {
  totalUsers: number;
  totalVolume: number;
  totalFees: number;
  activeUsers: number;
  pendingPayouts: number;
  dailyVolume: Array<{ date: string; volume: number }>;
  topUsers: Array<{ tag: string; volume: number; transactions: number }>;
}

export interface WebSocketMessage {
  type: 'balance_update' | 'transaction_update' | 'system_alert';
  data: any;
  timestamp: string;
}