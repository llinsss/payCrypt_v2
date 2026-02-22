# Backend Issues for Contributors

High-quality, production-ready backend issues with comprehensive implementation guidance.

---

## 🔴 Issue #1: Redis Caching Layer for Balance Queries

**Labels:** `priority: high` `difficulty: medium` `type: performance` `area: caching` `good-first-issue: no`

### 📋 Description
Balance queries currently hit PostgreSQL on every request, causing unnecessary database load. Implement Redis caching to improve response times from ~200ms to ~10ms and reduce database load by 80%.

### 🎯 Business Value
- Reduce API response time by 95%
- Handle 10x more concurrent users
- Lower database costs
- Improve user experience

### 📝 Requirements
1. Cache user balances with configurable TTL (default 60s)
2. Implement cache invalidation on balance updates
3. Add cache hit/miss metrics to monitoring
4. Implement cache warming for top 1000 active users
5. Add Redis connection health checks
6. Handle Redis failures gracefully (fallback to DB)

### ✅ Acceptance Criteria
- [ ] Balance queries check Redis before PostgreSQL
- [ ] Cache invalidation triggers on: deposits, withdrawals, transfers
- [ ] Cache TTL configurable via `BALANCE_CACHE_TTL` env var
- [ ] Prometheus metrics expose cache hit rate
- [ ] 95%+ test coverage for caching logic
- [ ] Documentation includes cache architecture diagram
- [ ] Performance benchmarks show >80% improvement

### 📁 Files to Create
```
backend/
├── services/
│   └── CacheService.js          # Generic Redis caching service
├── middleware/
│   └── cacheMiddleware.js       # Express cache middleware
└── tests/
    └── services/
        └── CacheService.test.js
```

### 📝 Files to Modify
```
backend/
├── services/
│   └── BalanceService.js        # Add caching layer
├── config/
│   └── redis.js                 # Add cache config
├── .env.example                 # Add BALANCE_CACHE_TTL
└── docs/
    └── CACHING_STRATEGY.md      # Create new doc
```

### 🔧 Implementation Guide

**Step 1: Create CacheService**
```javascript
// services/CacheService.js
import redis from '../config/redis.js';

class CacheService {
  async get(key) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key, value, ttl = 60) {
    await redis.setex(key, ttl, JSON.stringify(value));
  }

  async invalidate(pattern) {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  }
}

export default new CacheService();
```

**Step 2: Update BalanceService**
```javascript
// services/BalanceService.js
import CacheService from './CacheService.js';

async getBalance(userId, chainId) {
  const cacheKey = `balance:${userId}:${chainId}`;
  
  // Try cache first
  const cached = await CacheService.get(cacheKey);
  if (cached) {
    metrics.cacheHit('balance');
    return cached;
  }
  
  // Cache miss - query database
  metrics.cacheMiss('balance');
  const balance = await db.query(/* ... */);
  
  // Store in cache
  await CacheService.set(cacheKey, balance, process.env.BALANCE_CACHE_TTL);
  
  return balance;
}

async invalidateBalanceCache(userId, chainId = '*') {
  await CacheService.invalidate(`balance:${userId}:${chainId}`);
}
```

### 🧪 Testing Requirements
```javascript
// tests/services/CacheService.test.js
describe('CacheService', () => {
  it('should cache and retrieve values');
  it('should handle cache misses');
  it('should invalidate by pattern');
  it('should handle Redis connection failures');
  it('should respect TTL');
});
```

### 📊 Success Metrics
- Cache hit rate > 85%
- Average response time < 20ms
- Database query reduction > 80%

---

## 🔴 Issue #2: Webhook System for Transaction Events

**Labels:** `priority: high` `difficulty: medium` `type: feature` `area: notifications` `good-first-issue: no`

### 📋 Description
Enable external services to receive real-time notifications about transaction events through webhooks with retry logic and signature verification.

### 🎯 Business Value
- Enable third-party integrations
- Real-time transaction notifications
- Reduce polling API calls
- Support enterprise customers

### 📝 Requirements
1. Support multiple webhook URLs per user
2. Retry failed deliveries (3 attempts with exponential backoff)
3. Sign payloads with HMAC-SHA256
4. Store delivery logs for 30 days
5. Support event filtering (created, completed, failed)
6. Rate limit webhook deliveries (100/min per user)

### ✅ Acceptance Criteria
- [ ] POST /api/webhooks - Register webhook endpoint
- [ ] GET /api/webhooks - List user's webhooks
- [ ] PUT /api/webhooks/:id - Update webhook
- [ ] DELETE /api/webhooks/:id - Remove webhook
- [ ] GET /api/webhooks/:id/deliveries - View delivery logs
- [ ] Webhooks fire within 5 seconds of event
- [ ] Failed deliveries retry at 1s, 10s, 60s intervals
- [ ] Signature verification example in docs
- [ ] 90%+ test coverage

### 📁 Files to Create
```
backend/
├── services/
│   └── WebhookService.js
├── controllers/
│   └── webhookController.js
├── routes/
│   └── webhooks.js
├── models/
│   ├── Webhook.js
│   └── WebhookDelivery.js
├── queues/
│   └── webhookQueue.js
├── schemas/
│   └── webhook.js
├── migrations/
│   └── 20240221_create_webhooks.js
└── tests/
    ├── services/
    │   └── WebhookService.test.js
    └── controllers/
        └── webhookController.test.js
```

### 📝 Files to Modify
```
backend/
├── models/
│   └── Transaction.js           # Add webhook trigger
├── server.js                    # Register webhook routes
└── docs/
    └── WEBHOOKS.md              # Create webhook guide
```

### 🗄️ Database Schema
```sql
-- migrations/20240221_create_webhooks.js
CREATE TABLE webhooks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url VARCHAR(500) NOT NULL,
  secret VARCHAR(64) NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_url CHECK (url ~* '^https?://'),
  CONSTRAINT valid_events CHECK (
    events <@ ARRAY['transaction.created', 'transaction.completed', 'transaction.failed']
  )
);

CREATE INDEX idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX idx_webhooks_active ON webhooks(active) WHERE active = true;

CREATE TABLE webhook_deliveries (
  id SERIAL PRIMARY KEY,
  webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  response_code INTEGER,
  response_body TEXT,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  next_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'success', 'failed', 'retrying'))
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) 
  WHERE status = 'retrying';
```

### 🔧 Implementation Guide

**Webhook Payload Format:**
```json
{
  "event": "transaction.completed",
  "timestamp": "2024-02-21T10:30:00Z",
  "data": {
    "id": 12345,
    "user_id": 42,
    "amount": "100.00",
    "status": "completed",
    "hash": "0x..."
  }
}
```

**Signature Generation:**
```javascript
const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', webhook.secret)
  .update(JSON.stringify(payload))
  .digest('hex');

headers['X-Webhook-Signature'] = signature;
headers['X-Webhook-Timestamp'] = Date.now();
```

### 🧪 Testing Requirements
- Unit tests for signature generation
- Integration tests for webhook delivery
- Test retry logic with mock failures
- Test concurrent webhook deliveries

---

## 🔴 Issue #3: Redis-Backed Rate Limiting

**Labels:** `priority: high` `difficulty: easy` `type: security` `area: middleware` `good-first-issue: yes`

### 📋 Description
Implement Redis-backed rate limiting to prevent API abuse, ensure fair usage, and protect against DDoS attacks.

### 🎯 Business Value
- Prevent API abuse
- Ensure fair resource allocation
- Reduce infrastructure costs
- Improve service stability

### 📝 Requirements
1. Tiered rate limits (anonymous: 100/15min, authenticated: 1000/15min, admin: 5000/15min)
2. Per-endpoint custom limits
3. Return standard rate limit headers
4. IP-based limiting for anonymous users
5. User-based limiting for authenticated users
6. Whitelist for trusted IPs
7. Configurable via environment variables

### ✅ Acceptance Criteria
- [ ] Rate limiting active on all API routes
- [ ] Headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
- [ ] 429 status with Retry-After header when exceeded
- [ ] Admin endpoints have stricter limits
- [ ] Whitelist bypasses rate limits
- [ ] Tests verify all limit tiers
- [ ] Documentation includes rate limit table

### 📁 Files to Create
```
backend/
├── middleware/
│   └── rateLimiter.js
├── config/
│   └── rateLimits.js
└── tests/
    └── middleware/
        └── rateLimiter.test.js
```

### 📝 Files to Modify
```
backend/
├── server.js                    # Apply rate limiting
├── .env.example                 # Add rate limit configs
└── docs/
    └── API_RATE_LIMITS.md       # Create rate limit docs
```

### 🔧 Implementation Guide

**Configuration:**
```javascript
// config/rateLimits.js
export default {
  anonymous: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP'
  },
  authenticated: {
    windowMs: 15 * 60 * 1000,
    max: 1000,
    keyGenerator: (req) => req.user.id
  },
  admin: {
    windowMs: 15 * 60 * 1000,
    max: 5000
  },
  endpoints: {
    '/api/auth/login': { windowMs: 15 * 60 * 1000, max: 5 },
    '/api/transactions': { windowMs: 60 * 1000, max: 100 }
  },
  whitelist: process.env.RATE_LIMIT_WHITELIST?.split(',') || []
};
```

### 📊 Rate Limit Table
| User Type | Window | Max Requests | Endpoints |
|-----------|--------|--------------|-----------|
| Anonymous | 15 min | 100 | All |
| Authenticated | 15 min | 1,000 | All |
| Admin | 15 min | 5,000 | All |
| Login | 15 min | 5 | /api/auth/login |
| Transactions | 1 min | 100 | /api/transactions |

---

## 🟡 Issue #4: Structured API Request Logging

**Labels:** `priority: medium` `difficulty: easy` `type: observability` `area: logging` `good-first-issue: yes`

### 📋 Description
Implement comprehensive structured logging with correlation IDs for request tracing and debugging.

### 📁 Files to Create
```
backend/
├── middleware/
│   ├── requestLogger.js
│   └── correlationId.js
├── utils/
│   └── logger.js
└── tests/
    └── middleware/
        └── requestLogger.test.js
```

### 📝 Files to Modify
```
backend/
├── server.js
├── .env.example
└── package.json                 # Add pino-http
```

---

## 🟡 Issue #5: Transaction Export (CSV/PDF)

**Labels:** `priority: medium` `difficulty: medium` `type: feature` `area: reporting` `good-first-issue: no`

### 📁 Files to Create
```
backend/
├── services/
│   ├── ExportService.js
│   ├── PdfGenerator.js
│   └── CsvGenerator.js
├── controllers/
│   └── exportController.js
├── routes/
│   └── exports.js
├── queues/
│   └── exportQueue.js
├── templates/
│   └── transaction-export.html
└── tests/
    └── services/
        ├── ExportService.test.js
        └── PdfGenerator.test.js
```

---

## 🔴 Issue #6: Two-Factor Authentication (2FA)

**Labels:** `priority: high` `difficulty: hard` `type: security` `area: authentication` `good-first-issue: no`

### 📁 Files to Create
```
backend/
├── services/
│   └── TwoFactorService.js
├── controllers/
│   └── twoFactorController.js
├── routes/
│   └── twoFactor.js
├── schemas/
│   └── twoFactor.js
├── migrations/
│   └── 20240221_add_2fa_to_users.js
└── tests/
    └── services/
        └── TwoFactorService.test.js
```

### 📝 Files to Modify
```
backend/
├── models/
│   └── User.js
├── controllers/
│   └── authController.js
├── middleware/
│   └── auth.js
└── package.json                 # Add speakeasy, qrcode
```

---

## 🟡 Issue #7: Analytics Dashboard API

**Labels:** `priority: medium` `difficulty: medium` `type: feature` `area: analytics` `good-first-issue: no`

### 📁 Files to Create
```
backend/
├── services/
│   └── AnalyticsService.js
├── controllers/
│   └── analyticsController.js
├── routes/
│   └── analytics.js
└── tests/
    └── services/
        └── AnalyticsService.test.js
```

---

## 🟡 Issue #8: Batch Payment Processing

**Labels:** `priority: medium` `difficulty: hard` `type: feature` `area: payments` `good-first-issue: no`

### 📁 Files to Create
```
backend/
├── services/
│   └── BatchPaymentService.js
├── controllers/
│   └── batchPaymentController.js
├── routes/
│   └── batchPayments.js
├── models/
│   └── BatchPayment.js
├── queues/
│   └── batchPaymentQueue.js
├── schemas/
│   └── batchPayment.js
├── migrations/
│   └── 20240221_create_batch_payments.js
└── tests/
    └── services/
        └── BatchPaymentService.test.js
```

---

## 🟡 Issue #9: API Versioning

**Labels:** `priority: medium` `difficulty: medium` `type: architecture` `area: api` `good-first-issue: no`

### 📁 Files to Create
```
backend/
├── middleware/
│   └── versionMiddleware.js
├── routes/
│   ├── v1/
│   │   └── index.js
│   └── v2/
│       └── index.js
└── docs/
    └── API_VERSIONING.md
```

### 📝 Files to Modify
```
backend/
├── server.js
└── routes/*.js                  # Organize into v1/v2
```

---

## 🚀 Getting Started

### For Contributors
1. Choose an issue matching your skill level
2. Comment to claim the issue
3. Fork and create feature branch: `git checkout -b feature/issue-N`
4. Follow the file structure exactly as specified
5. Write tests achieving required coverage
6. Update documentation
7. Submit PR with issue reference

### Label Guide
- `priority: high/medium/low` - Urgency level
- `difficulty: easy/medium/hard` - Complexity
- `type: feature/bug/enhancement` - Change type
- `area: *` - System component
- `good-first-issue: yes/no` - Beginner friendly

### Questions?
- Review [CONTRIBUTING.md](CONTRIBUTING.md)
- Check existing code patterns
- Ask in issue comments
