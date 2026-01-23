import {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  ValidationError,
} from './errors';
import type { HttpClientConfig, RequestOptions } from '../types';

/**
 * Default configuration for the HTTP client
 */
const DEFAULT_CONFIG: Required<HttpClientConfig> = {
  baseUrl: 'https://api.taggedpay.xyz',
  apiKey: '',
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
  retryBackoffMultiplier: 2,
};

/**
 * HTTP client with retry support and error handling
 */
export class HttpClient {
  private readonly config: Required<HttpClientConfig>;

  constructor(config: HttpClientConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update the API key
   */
  public setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }

  /**
   * Get the current base URL
   */
  public getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Make a GET request
   */
  public async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  /**
   * Make a POST request
   */
  public async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * Make a PUT request
   */
  public async put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  /**
   * Make a DELETE request
   */
  public async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  /**
   * Make a PATCH request
   */
  public async patch<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  /**
   * Execute request with retry logic
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const headers = this.buildHeaders(options?.headers);
    const timeout = options?.timeout ?? this.config.timeout;
    const maxRetries = options?.retries ?? this.config.retries;

    let lastError: Error | null = null;
    let retryDelay = this.config.retryDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(
          method,
          url,
          headers,
          body,
          timeout
        );
        return response as T;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        if (!this.shouldRetry(error as Error, attempt, maxRetries)) {
          throw error;
        }

        // For rate limit errors, honor the retryAfter header if available
        if (error instanceof RateLimitError && error.retryAfter) {
          // retryAfter is in seconds, convert to milliseconds
          await this.sleep(error.retryAfter * 1000);
        } else {
          // Wait before retrying with exponential backoff
          await this.sleep(retryDelay);
          retryDelay *= this.config.retryBackoffMultiplier;
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute the actual HTTP request
   */
  private async executeRequest(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown,
    timeout?: number
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = timeout
      ? setTimeout(() => controller.abort(), timeout)
      : null;

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const data = await this.parseResponse(response);

      if (!response.ok) {
        throw this.createErrorFromResponse(response, data);
      }

      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(`Request timed out after ${timeout}ms`);
      }
      if (
        error instanceof ApiError ||
        error instanceof AuthenticationError ||
        error instanceof AuthorizationError ||
        error instanceof NotFoundError ||
        error instanceof ValidationError ||
        error instanceof RateLimitError
      ) {
        throw error;
      }
      throw new NetworkError(
        error instanceof Error ? error.message : 'Network request failed'
      );
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Parse response body
   */
  private async parseResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    return response.text();
  }

  /**
   * Create appropriate error from response
   */
  private createErrorFromResponse(
    response: Response,
    data: unknown
  ): Error {
    const message = this.extractErrorMessage(data) || response.statusText;
    const details = typeof data === 'object' && data !== null ? data as Record<string, unknown> : undefined;

    switch (response.status) {
      case 400:
        if (this.hasValidationErrors(data)) {
          return new ValidationError(
            message,
            (data as { errors: Record<string, string[]> }).errors
          );
        }
        return new ApiError(message, 400, details);

      case 401:
        return new AuthenticationError(message);

      case 403:
        return new AuthorizationError(message);

      case 404:
        return new NotFoundError(message);

      case 429: {
        const retryAfter = parseInt(
          response.headers.get('retry-after') || '60',
          10
        );
        return new RateLimitError(message, retryAfter);
      }

      default:
        return new ApiError(message, response.status, details);
    }
  }

  /**
   * Extract error message from response data
   */
  private extractErrorMessage(data: unknown): string | undefined {
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (typeof obj.message === 'string') return obj.message;
      if (typeof obj.error === 'string') return obj.error;
      if (typeof obj.msg === 'string') return obj.msg;
    }
    return undefined;
  }

  /**
   * Check if response contains validation errors
   */
  private hasValidationErrors(data: unknown): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      'errors' in data &&
      typeof (data as { errors: unknown }).errors === 'object'
    );
  }

  /**
   * Determine if request should be retried
   */
  private shouldRetry(
    error: Error,
    attempt: number,
    maxRetries: number
  ): boolean {
    // Don't retry if we've exhausted attempts
    if (attempt >= maxRetries) return false;

    // Retry on network errors
    if (error instanceof NetworkError) return true;

    // Retry on timeout errors
    if (error instanceof TimeoutError) return true;

    // Retry on rate limit (with backoff)
    if (error instanceof RateLimitError) return true;

    // Retry on server errors (5xx)
    if (error instanceof ApiError && error.statusCode && error.statusCode >= 500) {
      return true;
    }

    // Don't retry on client errors (4xx)
    return false;
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): string {
    const baseUrl = this.config.baseUrl.replace(/\/$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${baseUrl}${normalizedPath}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Build request headers
   */
  private buildHeaders(
    customHeaders?: Record<string, string>
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    if (customHeaders) {
      Object.assign(headers, customHeaders);
    }

    return headers;
  }

  /**
   * Sleep for specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
