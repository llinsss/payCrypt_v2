import {
  AbortedError,
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
  maxRetryDelay: 30000,
};

/**
 * HTTP methods that HTTP semantics guarantee are safe to repeat
 * automatically. POST and PATCH are excluded: replaying them after an
 * ambiguous failure (e.g. a timeout after the server already committed the
 * write) can duplicate side effects such as payments (#618).
 */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);

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
   * Execute request with retry logic.
   *
   * #618: retries are only attempted for methods that HTTP semantics
   * guarantee are safe to repeat (GET/HEAD/OPTIONS/PUT/DELETE), or when the
   * caller explicitly opts a mutation in via `idempotencyKey`/`idempotent`.
   * Without that, a POST/PATCH that fails ambiguously (e.g. times out after
   * the server already committed it) is surfaced to the caller instead of
   * being silently replayed.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);
    const headers = this.buildHeaders(options?.headers, options?.idempotencyKey);
    const timeout = options?.timeout ?? this.config.timeout;
    const maxRetries = options?.retries ?? this.config.retries;
    const canRetryMethod =
      IDEMPOTENT_METHODS.has(method.toUpperCase()) ||
      Boolean(options?.idempotencyKey) ||
      options?.idempotent === true;

    let lastError: Error | null = null;
    let retryDelay = this.config.retryDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (options?.signal?.aborted) {
        throw new AbortedError();
      }

      try {
        const response = await this.executeRequest(
          method,
          url,
          headers,
          body,
          timeout,
          options?.signal
        );
        return response as T;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof AbortedError) {
          throw error;
        }

        // Don't retry on certain errors, or on methods that aren't safe to replay
        if (!canRetryMethod || !this.shouldRetry(error as Error, attempt, maxRetries)) {
          throw error;
        }

        // #619: honor the server's Retry-After when present (already parsed
        // and clamped), otherwise fall back to exponential backoff — both
        // bounded by maxRetryDelay and given bounded jitter to avoid
        // synchronized retry storms.
        const isRateLimited =
          error instanceof RateLimitError && error.retryAfter !== undefined;
        const baseDelay = isRateLimited
          ? this.clampDelay((error as RateLimitError).retryAfter! * 1000)
          : this.clampDelay(retryDelay);

        await this.sleep(this.addJitter(baseDelay), options?.signal);

        if (!isRateLimited) {
          retryDelay = this.clampDelay(retryDelay * this.config.retryBackoffMultiplier);
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
    timeout?: number,
    externalSignal?: AbortSignal
  ): Promise<unknown> {
    if (externalSignal?.aborted) {
      throw new AbortedError();
    }

    const controller = new AbortController();
    const timeoutId = timeout
      ? setTimeout(() => controller.abort(), timeout)
      : null;
    let abortedExternally = false;
    const onExternalAbort = () => {
      abortedExternally = true;
      controller.abort();
    };
    externalSignal?.addEventListener('abort', onExternalAbort);

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
        if (abortedExternally) {
          throw new AbortedError();
        }
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
      externalSignal?.removeEventListener('abort', onExternalAbort);
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
        const retryAfterMs = this.parseRetryAfter(
          response.headers.get('retry-after')
        );
        const retryAfter =
          retryAfterMs !== null ? retryAfterMs / 1000 : undefined;
        return new RateLimitError(message, retryAfter);
      }

      default:
        return new ApiError(message, response.status, details);
    }
  }

  /**
   * Parse a `Retry-After` header per RFC 7231 §7.1.3: either an integer
   * number of delta-seconds, or an HTTP-date. Returns milliseconds to wait,
   * clamped to `[0, maxRetryDelay]`, or `null` if the header is missing or
   * neither form can be parsed (#619) — malformed/absent headers fall back
   * to standard exponential backoff instead of producing a `NaN` delay or
   * an unbounded wait.
   */
  private parseRetryAfter(headerValue: string | null): number | null {
    if (!headerValue) return null;
    const trimmed = headerValue.trim();

    if (/^\d+$/.test(trimmed)) {
      const seconds = Number(trimmed);
      if (!Number.isFinite(seconds)) return null;
      return this.clampDelay(seconds * 1000);
    }

    const dateMs = Date.parse(trimmed);
    if (!Number.isNaN(dateMs)) {
      return this.clampDelay(dateMs - Date.now());
    }

    return null;
  }

  /**
   * Clamp a delay to `[0, maxRetryDelay]` (#619) — guards against both a
   * past `Retry-After` date (negative delay) and an excessively large one
   * (a synchronized multi-minute stall).
   */
  private clampDelay(delayMs: number): number {
    return Math.min(Math.max(delayMs, 0), this.config.maxRetryDelay);
  }

  /**
   * Add bounded random jitter on top of a base delay (#619), so many
   * clients retrying at once don't all wake at exactly the same instant.
   * Jitter is only ever added, never subtracted, so a server-specified
   * `Retry-After` is never undercut.
   */
  private addJitter(delayMs: number): number {
    const maxJitter = Math.min(delayMs * 0.2, 5000);
    return delayMs + Math.random() * maxJitter;
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
    customHeaders?: Record<string, string>,
    idempotencyKey?: string
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    if (customHeaders) {
      Object.assign(headers, customHeaders);
    }

    return headers;
  }

  /**
   * Sleep for specified duration. If `signal` is aborted before or during
   * the wait, rejects immediately instead of waiting it out (#619).
   */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new AbortedError());
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      const onAbort = () => {
        clearTimeout(timer);
        reject(new AbortedError());
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
