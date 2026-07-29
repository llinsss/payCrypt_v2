import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

import {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors';

export interface HttpClientConfig {
  baseUrl: string;
  apiKey?: string;
  token?: string;
  timeout?: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export class HttpClient {
  private client: AxiosInstance;
  private config: HttpClientConfig;

  constructor(config: HttpClientConfig) {
    this.config = config;

    this.client = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {}),
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (!error.response) {
          throw new NetworkError(error.message);
        }

        const { status, data } = error.response;

        switch (status) {
          case 401:
            // Attempt token refresh
            if (this.config.token) {
              const newToken = await this.refreshToken(error.config);
              if (newToken) {
                error.config.headers.Authorization = `Bearer ${newToken}`;
                return this.client.request(error.config);
              }
            }
            throw new AuthenticationError(data?.message);
          case 403:
            throw new AuthorizationError(data?.message);
          case 404:
            throw new NotFoundError(data?.message);
          case 422:
            throw new ValidationError(
              data?.message || 'Validation failed',
              data?.details
            );
          case 429:
            throw new RateLimitError(
              data?.message,
              data?.retryAfter
            );
          default:
            throw new ApiError(
              data?.message || `Request failed with status ${status}`,
              status,
              data
            );
        }
      }
    );
  }

  private refreshTokenCallback: (() => Promise<string | null>) | null = null;

  setRefreshTokenHandler(handler: () => Promise<string | null>): void {
    this.refreshTokenCallback = handler;
  }

  private async refreshToken(failedConfig: AxiosRequestConfig): Promise<string | null> {
    if (!this.refreshTokenCallback) return null;
    try {
      const newToken = await this.refreshTokenCallback();
      if (newToken) {
        this.config.token = newToken;
        this.client.defaults.headers.common.Authorization = `Bearer ${newToken}`;
        return newToken;
      }
    } catch {
      // Refresh failed
    }
    return null;
  }

  setToken(token: string | undefined): void {
    this.config.token = token;
    if (token) {
      this.client.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
      delete this.client.defaults.headers.common.Authorization;
    }
  }

  async get<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    const config: AxiosRequestConfig = {};
    if (options?.headers) config.headers = options.headers;
    if (options?.timeout) config.timeout = options.timeout;
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T = unknown>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    const config: AxiosRequestConfig = {};
    if (options?.headers) config.headers = options.headers;
    if (options?.timeout) config.timeout = options.timeout;
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T = unknown>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    const config: AxiosRequestConfig = {};
    if (options?.headers) config.headers = options.headers;
    if (options?.timeout) config.timeout = options.timeout;
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T = unknown>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    const config: AxiosRequestConfig = {};
    if (options?.headers) config.headers = options.headers;
    if (options?.timeout) config.timeout = options.timeout;
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    const config: AxiosRequestConfig = {};
    if (options?.headers) config.headers = options.headers;
    if (options?.timeout) config.timeout = options.timeout;
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}
