import { User, Transaction, Balance, Token, Chain } from '../types';

export const mockChains: Chain[] = [
  {
    id: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    rpcUrl: 'https://mainnet.infura.io/v3/',
    blockExplorer: 'https://etherscan.io',
    nativeCurrency: 'ETH'
  },
  {
    id: 'starknet',
    name: 'Starknet',
    symbol: 'STRK',
    rpcUrl: 'https://alpha-mainnet.starknet.io',
    blockExplorer: 'https://starkscan.co',
    nativeCurrency: 'STRK'
  },
  {
    id: 'base',
    name: 'Base',
    symbol: 'ETH',
    rpcUrl: 'https://mainnet.base.org',
    blockExplorer: 'https://basescan.org',
    nativeCurrency: 'ETH'
  },
  {
    id: 'core',
    name: 'Core',
    symbol: 'CORE',
    rpcUrl: 'https://rpc.coredao.org',
    blockExplorer: 'https://scan.coredao.org',
    nativeCurrency: 'CORE'
  }
];

export const mockTokens: Token[] = [
  {
    address: '0x0000000000000000000000000000000000000000',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    logoUrl: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
    chain: 'ethereum',
    price: 2450.0
  },
  {
    address: '0xA0b86a33E6415765b52957f0C6B4Cce0CdD9b9F2',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoUrl: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
    chain: 'ethereum',
    price: 1.0
  },
  {
    address: '0x0000000000000000000000000000000000000001',
    symbol: 'STRK',
    name: 'Starknet Token',
    decimals: 18,
    logoUrl: 'https://cryptologos.cc/logos/starknet-strk-logo.png',
    chain: 'starknet',
    price: 0.75
  },
  {
    address: '0x0000000000000000000000000000000000000002',
    symbol: 'CORE',
    name: 'Core Token',
    decimals: 18,
    logoUrl: 'https://cryptologos.cc/logos/core-core-logo.png',
    chain: 'core',
    price: 1.25
  }
];

export const mockUser: User = {
  id: '1',
  tag: 'llins',
  walletAddress: '0x742d35Cc6634C0532925a3b8D404FdDA8C6b8AC2',
  isVerified: true,
  createdAt: '2024-01-15T10:30:00Z',
  totalDeposits: 15000,
  totalWithdrawals: 3500
};

export const mockBalances: Balance[] = [
  {
    token: 'ETH',
    symbol: 'ETH',
    amount: 2.5,
    usdValue: 6125.0,
    chain: 'ethereum'
  },
  {
    token: 'USDC',
    symbol: 'USDC',
    amount: 5000,
    usdValue: 5000.0,
    chain: 'ethereum'
  },
  {
    token: 'STRK',
    symbol: 'STRK',
    amount: 1500,
    usdValue: 1125.0,
    chain: 'starknet'
  },
  {
    token: 'CORE',
    symbol: 'CORE',
    amount: 800,
    usdValue: 1000.0,
    chain: 'core'
  }
];

export const mockTransactions: Transaction[] = [
  {
    id: '1',
    type: 'deposit',
    tag: 'llins',
    token: 'ETH',
    amount: 1.0,
    usdValue: 2450.0,
    status: 'completed',
    txHash: '0x123...abc',
    chain: 'ethereum',
    timestamp: '2024-01-20T14:30:00Z',
    fromAddress: '0x456...def'
  },
  {
    id: '2',
    type: 'withdrawal',
    tag: 'llins',
    token: 'USDC',
    amount: 500,
    usdValue: 500.0,
    status: 'pending',
    chain: 'ethereum',
    timestamp: '2024-01-20T13:15:00Z',
    toAddress: '0x789...ghi'
  },
  {
    id: '3',
    type: 'swap',
    tag: 'llins',
    token: 'ETH',
    amount: 0.5,
    usdValue: 1225.0,
    status: 'completed',
    txHash: '0x321...cba',
    chain: 'ethereum',
    timestamp: '2024-01-20T12:00:00Z'
  }
];

export const getTransactionStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'text-emerald-600 bg-emerald-50';
    case 'pending':
      return 'text-amber-600 bg-amber-50';
    case 'failed':
      return 'text-red-600 bg-red-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
};

export const formatCurrency = (amount: number, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

export const formatCrypto = (amount: number, symbol: string) => {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  })} ${symbol}`;
};