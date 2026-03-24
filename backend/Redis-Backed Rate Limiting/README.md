# NestJS Redis-Backed Rate Limiting

A production-ready NestJS implementation of Redis-backed rate limiting to prevent API abuse and ensure fair usage.

## Features

✅ Tiered rate limits (anonymous, authenticated, admin)
✅ Per-endpoint custom limits
✅ Standard rate limit headers (X-RateLimit-\*)
✅ IP-based limiting for anonymous users
✅ User-based limiting for authenticated users
✅ IP whitelist for trusted sources
✅ Configurable via environment variables
✅ Comprehensive test coverage
✅ 429 responses with Retry-After headers

## Quick Start

### Prerequisites

- Node.js 18+
- Redis 6+

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

### Start Redis

```bash
# Using Docker
docker run -d -p 6379:6379 redis:latest

# Or using local Redis
redis-server
```

### Run Application

```bash
# Development
npm run start:dev

# Production
npm run start
```

### Run Tests

```bash
npm test
```

## Rate Limit Tiers

| User Type     | Window | Max Requests |
| ------------- | ------ | ------------ |
| Anonymous     | 15 min | 100          |
| Authenticated | 15 min | 1,000        |
| Admin         | 15 min | 5,000        |
| Login         | 15 min | 5            |
| Transactions  | 1 min  | 100          |

## Architecture

### Components

- **RateLimitGuard**: Global guard that intercepts all requests
- **RedisService**: Redis client wrapper for rate limit operations
- **rateLimitsConfig**: Centralized configuration for all rate limits

### How It Works

1. Request arrives at any endpoint
2. Guard checks if IP is whitelisted
3. Determines appropriate rate limit tier (anonymous/authenticated/admin)
4. Checks for endpoint-specific limits
5. Queries Redis for current request count
6. Sets rate limit headers
7. Allows or denies request with appropriate response

### Redis Data Structure

Uses Redis sorted sets with timestamps:

- Key: `rate-limit:{type}:{identifier}:{endpoint}`
- Score: Unix timestamp in milliseconds
- Member: Unique request identifier

## API Documentation

See [API_RATE_LIMITS.md](docs/API_RATE_LIMITS.md) for complete documentation.

## Testing

The implementation includes comprehensive tests covering:

- Anonymous user limits
- Authenticated user limits
- Admin user limits
- Endpoint-specific limits
- Whitelist functionality
- Rate limit headers
- 429 responses

## Production Considerations

1. **Redis High Availability**: Use Redis Cluster or Sentinel for production
2. **Monitoring**: Track rate limit metrics and 429 responses
3. **Logging**: Log rate limit violations for security analysis
4. **Scaling**: Redis handles distributed rate limiting across multiple app instances
5. **Tuning**: Adjust limits based on actual usage patterns

## License

MIT
