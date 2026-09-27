import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { HttpClient } from './http';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ApiError,
  NetworkError,
} from './errors';

function createMockAdapter(
  handler: (config: InternalAxiosRequestConfig) => Promise<{ status: number; data?: any; headers?: any }>
) {
  return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const res = await handler(config);
    const response: AxiosResponse = {
      data: res.data,
      status: res.status,
      statusText: String(res.status),
      headers: res.headers || {},
      config,
    };

    if (res.status >= 200 && res.status < 300) {
      return response;
    }

    const error: any = new Error(`Request failed with status code ${res.status}`);
    error.config = config;
    error.response = response;
    throw error;
  };
}

describe('HttpClient Single-Flight Refresh and 401 Retry Prevention', () => {
  it('should refresh token on 401 and retry request with new token', async () => {
    let callCount = 0;
    let refreshCount = 0;

    const httpClient = new HttpClient({
      baseUrl: 'https://api.example.com',
      token: 'expired-token',
    });

    httpClient.setRefreshTokenHandler(async () => {
      refreshCount++;
      return 'new-refreshed-token';
    });

    (httpClient as any).client.defaults.adapter = createMockAdapter(async (config) => {
      callCount++;
      if (config.headers?.Authorization === 'Bearer new-refreshed-token') {
        return { status: 200, data: { success: true, user: 'alice' } };
      }
      return { status: 401, data: { message: 'Token expired' } };
    });

    const result = await httpClient.get<{ success: boolean; user: string }>('/users/me');
    assert.deepStrictEqual(result, { success: true, user: 'alice' });
    assert.strictEqual(refreshCount, 1);
    assert.strictEqual(callCount, 2); // Initial 401 + 1 retry
  });

  it('should single-flight concurrent 401 requests sharing a single refresh call', async () => {
    let refreshCount = 0;
    let callCount = 0;

    const httpClient = new HttpClient({
      baseUrl: 'https://api.example.com',
      token: 'expired-token',
    });

    httpClient.setRefreshTokenHandler(async () => {
      refreshCount++;
      // Simulate asynchronous refresh network delay
      await new Promise((resolve) => setTimeout(resolve, 30));
      return 'shared-refreshed-token';
    });

    (httpClient as any).client.defaults.adapter = createMockAdapter(async (config) => {
      callCount++;
      if (config.headers?.Authorization === 'Bearer shared-refreshed-token') {
        return { status: 200, data: { success: true, url: config.url } };
      }
      return { status: 401, data: { message: 'Token expired' } };
    });

    // Trigger 5 concurrent requests simultaneously
    const results = await Promise.all([
      httpClient.get('/endpoint-1'),
      httpClient.get('/endpoint-2'),
      httpClient.get('/endpoint-3'),
      httpClient.get('/endpoint-4'),
      httpClient.get('/endpoint-5'),
    ]);

    assert.strictEqual(results.length, 5);
    assert.strictEqual(refreshCount, 1, 'Refresh handler should be called exactly once');
    assert.strictEqual(callCount, 10, 'Each of the 5 requests should attempt once, then retry once');
  });

  it('should prevent retry loops when retried request returns 401 again', async () => {
    let callCount = 0;
    let refreshCount = 0;

    const httpClient = new HttpClient({
      baseUrl: 'https://api.example.com',
      token: 'bad-token',
    });

    httpClient.setRefreshTokenHandler(async () => {
      refreshCount++;
      return 'still-bad-token';
    });

    (httpClient as any).client.defaults.adapter = createMockAdapter(async () => {
      callCount++;
      return { status: 401, data: { message: 'Invalid credentials' } };
    });

    await assert.rejects(
      async () => {
        await httpClient.get('/secret');
      },
      (err: any) => {
        assert(err instanceof AuthenticationError);
        assert.strictEqual(err.message, 'Invalid credentials');
        return true;
      }
    );

    assert.strictEqual(refreshCount, 1, 'Should only attempt refresh once');
    assert.strictEqual(callCount, 2, 'Should not loop infinitely (1 initial + 1 retry max)');
  });

  it('should throw AuthenticationError when refresh handler returns null', async () => {
    let callCount = 0;
    let refreshCount = 0;

    const httpClient = new HttpClient({
      baseUrl: 'https://api.example.com',
      token: 'expired-token',
    });

    httpClient.setRefreshTokenHandler(async () => {
      refreshCount++;
      return null; // Failed refresh (e.g., refresh token expired)
    });

    (httpClient as any).client.defaults.adapter = createMockAdapter(async () => {
      callCount++;
      return { status: 401, data: { message: 'Session expired' } };
    });

    await assert.rejects(
      async () => {
        await httpClient.get('/data');
      },
      (err: any) => {
        assert(err instanceof AuthenticationError);
        assert.strictEqual(err.message, 'Session expired');
        return true;
      }
    );

    assert.strictEqual(refreshCount, 1);
    assert.strictEqual(callCount, 1);
  });

  it('should propagate error message when refresh handler throws', async () => {
    let refreshCount = 0;

    const httpClient = new HttpClient({
      baseUrl: 'https://api.example.com',
      token: 'expired-token',
    });

    httpClient.setRefreshTokenHandler(async () => {
      refreshCount++;
      throw new Error('Refresh network connection timeout');
    });

    (httpClient as any).client.defaults.adapter = createMockAdapter(async () => {
      return { status: 401, data: { message: 'Expired' } };
    });

    await assert.rejects(
      async () => {
        await httpClient.get('/data');
      },
      (err: any) => {
        assert(err instanceof AuthenticationError);
        assert.strictEqual(err.message, 'Refresh network connection timeout');
        return true;
      }
    );

    assert.strictEqual(refreshCount, 1);
  });

  it('should handle non-401 HTTP errors without invoking refresh', async () => {
    let refreshCount = 0;

    const httpClient = new HttpClient({
      baseUrl: 'https://api.example.com',
    });

    httpClient.setRefreshTokenHandler(async () => {
      refreshCount++;
      return 'new-token';
    });

    // Test 403 Forbidden
    (httpClient as any).client.defaults.adapter = createMockAdapter(async () => {
      return { status: 403, data: { message: 'Permission denied' } };
    });

    await assert.rejects(
      async () => {
        await httpClient.get('/admin');
      },
      (err: any) => {
        assert(err instanceof AuthorizationError);
        assert.strictEqual(err.message, 'Permission denied');
        return true;
      }
    );

    // Test 404 Not Found
    (httpClient as any).client.defaults.adapter = createMockAdapter(async () => {
      return { status: 404, data: { message: 'User not found' } };
    });

    await assert.rejects(
      async () => {
        await httpClient.get('/users/999');
      },
      (err: any) => {
        assert(err instanceof NotFoundError);
        return true;
      }
    );

    // Test 422 Validation Error
    (httpClient as any).client.defaults.adapter = createMockAdapter(async () => {
      return { status: 422, data: { message: 'Invalid email format', details: { email: ['invalid'] } } };
    });

    await assert.rejects(
      async () => {
        await httpClient.post('/register', {});
      },
      (err: any) => {
        assert(err instanceof ValidationError);
        assert.strictEqual(err.message, 'Invalid email format');
        return true;
      }
    );

    // Test 429 Rate Limit
    (httpClient as any).client.defaults.adapter = createMockAdapter(async () => {
      return { status: 429, data: { message: 'Rate limit exceeded', retryAfter: 60 } };
    });

    await assert.rejects(
      async () => {
        await httpClient.get('/busy');
      },
      (err: any) => {
        assert(err instanceof RateLimitError);
        return true;
      }
    );

    // Test 500 Generic ApiError
    (httpClient as any).client.defaults.adapter = createMockAdapter(async () => {
      return { status: 500, data: { message: 'Internal server error' } };
    });

    await assert.rejects(
      async () => {
        await httpClient.get('/crash');
      },
      (err: any) => {
        assert(err instanceof ApiError);
        assert.strictEqual(err.statusCode, 500);
        return true;
      }
    );

    // Test Network Error (no response)
    (httpClient as any).client.defaults.adapter = async (config: any) => {
      const error: any = new Error('ECONNREFUSED');
      error.config = config;
      throw error;
    };

    await assert.rejects(
      async () => {
        await httpClient.get('/offline');
      },
      (err: any) => {
        assert(err instanceof NetworkError);
        return true;
      }
    );

    assert.strictEqual(refreshCount, 0, 'Refresh should never be invoked for non-401 responses');
  });

  it('should set and delete token in default headers correctly', () => {
    const httpClient = new HttpClient({
      baseUrl: 'https://api.example.com',
    });

    httpClient.setToken('my-token');
    assert.strictEqual((httpClient as any).client.defaults.headers.common.Authorization, 'Bearer my-token');

    httpClient.setToken(undefined);
    assert.strictEqual((httpClient as any).client.defaults.headers.common.Authorization, undefined);
  });
});
