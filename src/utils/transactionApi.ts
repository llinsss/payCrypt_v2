import { apiClient } from './api';
import { Transaction } from '../types';
import { parseTransaction, parseTransactionList } from './apiContracts';

// Transaction API interfaces
export interface CreateTransactionRequest {
  type: 'deposit' | 'withdrawal' | 'swap' | 'transfer';
  token: string;
  amount: number;
  chain: string;
  to_address?: string;
  from_address?: string;
}

export interface TransactionResponse {
  id: string;
  userId: string;
  type: string;
  token: string;
  amount: number;
  usd_value: number;
  status: string;
  tx_hash?: string;
  chain: string;
  created_at: string;
  from_address?: string;
  to_address?: string;
}

// Transaction API functions
export const transactionApi = {
  // Get all transactions for current user
  async getUserTransactions(): Promise<TransactionResponse[]> {
    try {
      const response = await apiClient.get<unknown>('/transactions');
      return parseTransactionList(response) as TransactionResponse[];
    } catch (error) {
      console.error('Failed to get transactions:', error);
      throw error;
    }
  },

  // Get all transactions (admin only)
  async getAllTransactions(): Promise<TransactionResponse[]> {
    try {
      const response = await apiClient.get<unknown>('/transactions/all');
      return parseTransactionList(response) as TransactionResponse[];
    } catch (error) {
      console.error('Failed to get all transactions:', error);
      throw error;
    }
  },

  // Create new transaction
  async createTransaction(transactionData: CreateTransactionRequest): Promise<TransactionResponse> {
    try {
      const response = await apiClient.post<unknown>('/transactions', transactionData);
      return parseTransaction(response) as TransactionResponse;
    } catch (error) {
      console.error('Failed to create transaction:', error);
      throw error;
    }
  },

  // Get transaction by ID
  async getTransactionById(id: string): Promise<TransactionResponse> {
    try {
      const response = await apiClient.get<unknown>(`/transactions/${id}`);
      return parseTransaction(response) as TransactionResponse;
    } catch (error) {
      console.error('Failed to get transaction:', error);
      throw error;
    }
  },

  // Update transaction status (admin only)
  async updateTransactionStatus(id: string, status: 'pending' | 'completed' | 'failed'): Promise<TransactionResponse> {
    try {
      const response = await apiClient.put<unknown>(`/transactions/${id}`, { status });
      return parseTransaction(response) as TransactionResponse;
    } catch (error) {
      console.error('Failed to update transaction status:', error);
      throw error;
    }
  }
};

// Helper function to convert backend transaction to frontend Transaction format
export const mapBackendTransactionToTransaction = (backendTransaction: TransactionResponse): Transaction => {
  return {
    id: backendTransaction.id,
    type: backendTransaction.type as 'deposit' | 'withdrawal' | 'swap' | 'transfer',
    tag: '', // This would need to be populated from user data
    token: backendTransaction.token,
    amount: backendTransaction.amount,
    usd_value: backendTransaction.usd_value,
    status: backendTransaction.status as 'pending' | 'completed' | 'failed',
    tx_hash: backendTransaction.tx_hash,
    chain: backendTransaction.chain,
    timestamp: backendTransaction.created_at,
    from_address: backendTransaction.from_address,
    to_address: backendTransaction.to_address
  };
};
