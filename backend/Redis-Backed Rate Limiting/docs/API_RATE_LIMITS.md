# API Rate Limiting Documentation

## Overview

This API implements Redis-backed rate limiting to prevent abuse, ensure fair usage, and protect against DDoS attacks. Rate limits are applied based on user authentication status, role, and specific endpoints.

## Rate Limit Tiers

| User Type     | Window | Max Requests | Endpoints           |
| ------------- | ------ | ------------ | ------------------- |
| Anonymous     | 15 min | 100          | All endpoints       |
| Authenticated | 15 min | 1,000        | All endpoints       |
| Admin         | 15 min | 5,000        | All endpoints       |
| Login         | 15 min | 5            | `/api/auth/login`   |
| Transactions  | 1 min  | 100          | `/api/transactions` |

## Rate Limit Headers

Every API response includes the following headers:

- `X-RateLimit-Limit`: Maximum number of requests allowed in the current window
- `X-RateLimit-Remaining`: Number of requests remaining in the current window
- `X-RateLimit-Reset`: Unix timestamp (in milliseconds) when the rate limit window resets

### Example Response Headers

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 847
X-RateLimit-Reset: 1708617600000
```

## Rate Limit Exceeded (429 Response)

When you exceed the rate limit, the API returns a `429 Too Many Requests` status with:

- `Retry-After`: Number of seconds to wait before making another request

### Example 429 Response

```json
{
  "statusCode": 429,
  "message": "Too many requests, please try again later",
  "retryAfter": 342
}
```

## Rate Limiting Logic

### Anonymous Users

- Limited by IP address
- 100 requests per 15-minute window
- Applies to all unauthenticated requests

### Authenticated Users

- Limited by user ID
- 1,000 requests per 15-minute window
- Requires valid authentication token

### Admin Users

- Limited by user ID
- 5,000 requests per 15-minute window
- Requires admin role in authentication token

### Endpoint-Specific Limits

Some endpoints have stricter limits to prevent abuse:

#### Login Endpoint (`/api/auth/login`)

- 5 requests per 15 minutes
- Prevents brute-force attacks
- Applied regardless of authentication status

#### Transactions Endpoint (`/api/transactions`)

- 100 requests per 1 minute
- Protects high-load operations
- Applied per user/IP

## IP Whitelist

Trusted IPs can bypass rate limiting entirely. Configure via environment variable:

```env
RATE_LIMIT_WHITELIST=127.0.0.1,::1,10.0.0.1
```

Default whitelisted IPs:

- `127.0.0.1` (localhost IPv4)
- `::1` (localhost IPv6)

## Configuration

Rate limits are configurable via environment variables:

```env
# Anonymous users
RATE_LIMIT_ANONYMOUS_MAX=100
RATE_LIMIT_ANONYMOUS_WINDOW_MS=900000

# Authenticated users
RATE_LIMIT_AUTHENTICATED_MAX=1000
RATE_LIMIT_AUTHENTICATED_WINDOW_MS=900000

# Admin users
RATE_LIMIT_ADMIN_MAX=5000
RATE_LIMIT_ADMIN_WINDOW_MS=900000

# Login endpoint
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_LOGIN_WINDOW_MS=900000

# Transactions endpoint
RATE_LIMIT_TRANSACTIONS_MAX=100
RATE_LIMIT_TRANSACTIONS_WINDOW_MS=60000

# Whitelist
RATE_LIMIT_WHITELIST=127.0.0.1,::1
```

## Best Practices

1. **Monitor Rate Limit Headers**: Check `X-RateLimit-Remaining` to avoid hitting limits
2. **Implement Exponential Backoff**: When receiving 429 responses, wait progressively longer between retries
3. **Use Authentication**: Authenticated users get 10x higher limits
4. **Respect Retry-After**: Wait the specified time before retrying
5. **Cache Responses**: Reduce unnecessary API calls by caching data client-side

## Implementation Details

### Technology Stack

- **Redis**: Distributed rate limit storage using sorted sets
- **NestJS Guard**: Applied globally to all routes
- **Sliding Window**: Accurate rate limiting using Redis sorted sets with timestamps

### Key Generation

- Anonymous: `rate-limit:ip:{ip}:{endpoint}`
- Authenticated: `rate-limit:user:{userId}:{endpoint}`

### Window Algorithm

Uses a sliding window algorithm with Redis sorted sets:

1. Remove expired entries outside the current window
2. Count remaining entries
3. Allow or deny based on count vs limit
4. Add new entry if allowed
5. Set expiration on the key

## Troubleshooting

### Getting 429 Errors

- Check `X-RateLimit-Remaining` header before making requests
- Use `Retry-After` header to determine wait time
- Consider authenticating for higher limits
- Contact support if you need higher limits

### Rate Limits Not Working

- Verify Redis is running and accessible
- Check environment variables are set correctly
- Ensure IP detection is working (check `X-Forwarded-For` headers)

### Whitelist Not Working

- Verify IP format in `RATE_LIMIT_WHITELIST`
- Check if proxy/load balancer is forwarding correct IP
- Restart application after changing whitelist

## Support

For questions or to request higher rate limits, contact the API team.
