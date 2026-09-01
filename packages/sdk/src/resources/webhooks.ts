import { HttpClient } from '../utils/http';
import { CreateWebhookRequest, Webhook } from '../types';

export class WebhooksResource {
  constructor(private http: HttpClient) {}

  /** Create a new webhook endpoint */
  async create(data: CreateWebhookRequest): Promise<Webhook> {
    return this.http.post<Webhook>('/webhooks', data);
  }

  /** List all webhooks for the authenticated user */
  async list(): Promise<Webhook[]> {
    return this.http.get<Webhook[]>('/webhooks');
  }

  /** Get a specific webhook by ID */
  async get(id: number): Promise<Webhook> {
    return this.http.get<Webhook>(`/webhooks/${id}`);
  }

  /** Update a webhook's configuration */
  async update(id: number, data: Partial<CreateWebhookRequest>): Promise<Webhook> {
    return this.http.put<Webhook>(`/webhooks/${id}`, data);
  }

  /** Delete a webhook */
  async delete(id: number): Promise<void> {
    await this.http.delete(`/webhooks/${id}`);
  }
}
