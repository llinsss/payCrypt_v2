import { apiClient } from './api';
import { Transaction } from '../types';

// Transaction API interfaces
export interface CreateTransactionRequest {
  type: 'deposit' | 'withdrawal' | 'swap' | 'transfer';
  token: string;
  amount: number;
  chain: string;
  toAddress?: string;
  fromAddress?: string;
}

export interface TransactionResponse {
  id: string;
  userId: string;
  type: string;
  token: string;
  amount: number;
  usdValue: number;
  status: string;
  txHash?: string;
  chain: string;
  createdAt: string;
  fromAddress?: string;
  toAddress?: string;
}

// Transaction API functions
export const transactionApi = {
  // Get all transactions for current user
  async getUserTransactions(): Promise<TransactionResponse[]> {
    try {
      const response = await apiClient.get<{ transactions: TransactionResponse[] }>('/transactions');
      return response.transactions;
    } catch (error) {
      console.error('Failed to get transactions:', error);
      throw error;
    }
  },

  // Get all transactions (admin only)
  async getAllTransactions(): Promise<TransactionResponse[]> {
    try {
      const response = await apiClient.get<{ transactions: TransactionResponse[] }>('/transactions/all');
      return response.transactions;
    } catch (error) {
      console.error('Failed to get all transactions:', error);
      throw error;
    }
  },

  // Create new transaction
  async createTransaction(transactionData: CreateTransactionRequest): Promise<TransactionResponse> {
    try {
      const response = await apiClient.post<{ transaction: TransactionResponse }>('/transactions', transactionData);
      return response.transaction;
    } catch (error) {
      console.error('Failed to create transaction:', error);
      throw error;
    }
  },

  // Get transaction by ID
  async getTransactionById(id: string): Promise<TransactionResponse> {
    try {
      const response = await apiClient.get<{ transaction: TransactionResponse }>(`/transactions/${id}`);
      return response.transaction;
    } catch (error) {
      console.error('Failed to get transaction:', error);
      throw error;
    }
  },

  // Update transaction status (admin only)
  async updateTransactionStatus(id: string, status: 'pending' | 'completed' | 'failed'): Promise<TransactionResponse> {
    try {
      const response = await apiClient.patch<{ transaction: TransactionResponse }>(`/transactions/${id}`, { status });
      return response.transaction;
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
    usdValue: backendTransaction.usdValue,
    status: backendTransaction.status as 'pending' | 'completed' | 'failed',
    txHash: backendTransaction.txHash,
    chain: backendTransaction.chain,
    timestamp: backendTransaction.createdAt,
    fromAddress: backendTransaction.fromAddress,
    toAddress: backendTransaction.toAddress
  };
};
