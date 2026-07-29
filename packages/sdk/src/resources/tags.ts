import { HttpClient } from '../utils/http';
import { ResolveTagResponse } from '../types';

export class TagsResource {
  constructor(private http: HttpClient) {}

  /** Resolve a @tag to see if it exists and get basic info */
  async resolve(tag: string): Promise<ResolveTagResponse> {
    const cleanTag = tag.startsWith('@') ? tag.substring(1) : tag;
    return this.http.get<ResolveTagResponse>(`/tags/${encodeURIComponent(cleanTag)}`);
  }

  /** Get the authenticated user's own tag info */
  async getMyTag(): Promise<unknown> {
    return this.http.get('/tags/me');
  }
}
