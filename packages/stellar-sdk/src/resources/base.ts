import { HttpClient } from '../utils/http';

/**
 * Base resource class that provides HTTP client access to all resources
 */
export abstract class BaseResource {
  protected readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  /**
   * Normalize a tag by removing @ prefix if present
   */
  protected normalizeTag(tag: string): string {
    return tag.startsWith('@') ? tag.slice(1) : tag;
  }

  /**
   * Format a tag with @ prefix
   */
  protected formatTag(tag: string): string {
    return tag.startsWith('@') ? tag : `@${tag}`;
  }
}
