import { HttpClient } from '../utils/http';
import {
  CreateScheduledPaymentRequest,
  ScheduledPayment,
  SendPaymentRequest,
  Transaction,
  TransactionListResponse,
} from '../types';

export class TransactionsResource {
  constructor(private http: HttpClient) {}

  /** Send a payment to a @tag */
  async send(data: SendPaymentRequest): Promise<Transaction> {
    return this.http.post<Transaction>('/wallets/send-to-tag', data);
  }

  /** List transactions with optional filters */
  async list(params?: {
    type?: 'debit' | 'credit';
    status?: 'pending' | 'completed' | 'failed';
    limit?: number;
    offset?: number;
  }): Promise<TransactionListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.set('type', params.type);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());

    const query = queryParams.toString();
    const endpoint = `/transactions${query ? `?${query}` : ''}`;
    return this.http.get<TransactionListResponse>(endpoint);
  }

  /** Get a single transaction by ID */
  async get(id: number): Promise<Transaction> {
    return this.http.get<Transaction>(`/transactions/${id}`);
  }

  /** Create a scheduled/recurring payment */
  async createScheduled(data: CreateScheduledPaymentRequest): Promise<ScheduledPayment> {
    return this.http.post<ScheduledPayment>('/scheduled-payments', data);
  }

  /** List scheduled payments */
  async listScheduled(params?: {
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ payments: ScheduledPayment[]; pagination: { total: number; limit: number; offset: number } }> {
    const queryParams = new URLSearchParams();
    if (params?.status) queryParams.set('status', params.status);
    if (params?.limit) queryParams.set('limit', params.limit.toString());
    if (params?.offset) queryParams.set('offset', params.offset.toString());

    const query = queryParams.toString();
    const endpoint = `/scheduled-payments${query ? `?${query}` : ''}`;
    return this.http.get(endpoint) as Promise<{
      payments: ScheduledPayment[];
      pagination: { total: number; limit: number; offset: number };
    }>;
  }

  /** Cancel a scheduled payment */
  async cancelScheduled(id: number): Promise<void> {
    await this.http.patch(`/scheduled-payments/${id}/cancel`, {});
  }

  /** Resume a paused scheduled payment */
  async resumeScheduled(id: number): Promise<void> {
    await this.http.patch(`/scheduled-payments/${id}/resume`, {});
  }
}
