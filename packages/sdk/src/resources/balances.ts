import { HttpClient } from '../utils/http';
import { BalanceResponse } from '../types';

export class BalancesResource {
  constructor(private http: HttpClient) {}

  /** Get all balances for the authenticated user */
  async get(): Promise<BalanceResponse> {
    return this.http.get<BalanceResponse>('/balances');
  }

  /** Get balance for a specific token */
  async getByToken(tokenId: number): Promise<unknown> {
    return this.http.get(`/balances/${tokenId}`);
  }
}
