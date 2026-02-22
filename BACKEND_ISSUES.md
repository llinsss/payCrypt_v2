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
Implement comprehensive structured logging with correlation IDs for request tracing and debugging. Currently, logs are unstructured and lack context, making debugging production issues difficult. This feature adds JSON-formatted logs with request correlation, timing metrics, and automatic PII redaction.

### 🎯 Business Value
- Reduce debugging time by 70%
- Enable distributed tracing
- Improve incident response
- Meet compliance requirements for audit logs

### 📝 Requirements
1. Log all API requests with method, path, status, duration
2. Generate unique correlation ID per request
3. Include user ID in logs (if authenticated)
4. Log request/response bodies for errors (4xx, 5xx)
5. Integrate with Pino logger for structured JSON
6. Redact sensitive data (passwords, tokens, secrets)
7. Add log rotation (daily, max 30 days)
8. Configurable log level via environment

### ✅ Acceptance Criteria
- [ ] All requests logged with correlation ID
- [ ] Logs include timing information (ms)
- [ ] Error logs include stack traces
- [ ] Logs are structured JSON format
- [ ] Sensitive data automatically redacted
- [ ] Log level configurable via LOG_LEVEL env var
- [ ] Tests verify redaction works
- [ ] Documentation includes log format examples

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

### 🔧 Implementation Guide

**Log Format:**
```json
{
  "level": "info",
  "time": "2024-02-21T10:30:00.000Z",
  "correlationId": "abc-123-def-456",
  "userId": 42,
  "method": "POST",
  "path": "/api/transactions",
  "statusCode": 201,
  "duration": 145,
  "userAgent": "Mozilla/5.0...",
  "ip": "192.168.1.1"
}
```

### 🧪 Testing Requirements
- Test correlation ID generation
- Test PII redaction (passwords, tokens)
- Test log levels (debug, info, warn, error)
- Test error logging with stack traces

### 📊 Success Metrics
- 100% request coverage
- Zero PII leaks in logs
- Log query time < 100ms

---

## 🟡 Issue #5: Transaction Export (CSV/PDF)

**Labels:** `priority: medium` `difficulty: medium` `type: feature` `area: reporting` `good-first-issue: no`

### 📋 Description
Allow users to export their transaction history in CSV and PDF formats for accounting, tax reporting, and record-keeping. Large exports are processed as background jobs with email notifications when ready.

### 🎯 Business Value
- Enable tax compliance for users
- Support accounting workflows
- Reduce support requests for transaction data
- Enterprise feature for business customers

### 📝 Requirements
1. Export transactions as CSV with all fields
2. Export transactions as PDF with Tagged branding
3. Filter by date range, status, chain, token
4. Queue large exports (>1000 records) as background jobs
5. Email download link when export ready
6. Expire export files after 24 hours
7. Rate limit exports (5 per hour per user)
8. Include export metadata (generated date, filters applied)

### ✅ Acceptance Criteria
- [ ] GET /api/transactions/export?format=csv&from=2024-01-01&to=2024-12-31
- [ ] GET /api/transactions/export?format=pdf&status=completed
- [ ] Exports respect user permissions (own transactions only)
- [ ] Large exports (>1000 records) processed in background
- [ ] Email notification sent with secure download link
- [ ] Export files auto-delete after 24 hours
- [ ] Tests cover both CSV and PDF formats
- [ ] Documentation includes filter examples

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

### 📝 Files to Modify
```
backend/
├── server.js                    # Register export routes
├── package.json                 # Add pdfkit, csv-stringify
└── .env.example                 # Add EXPORT_STORAGE_PATH
```

### 🔧 Implementation Guide

**CSV Format:**
```csv
Date,Transaction ID,Type,Amount,Token,Chain,Status,Hash
2024-02-21,12345,credit,100.00,XLM,Stellar,completed,0x...
```

**PDF Template:**
- Tagged logo and branding
- Export metadata (date range, filters)
- Transaction table with pagination
- Summary statistics (total volume, count)

### 🧪 Testing Requirements
- Test CSV generation with various filters
- Test PDF generation with branding
- Test background job processing
- Test file expiration (24 hours)
- Test email notification delivery

### 📊 Success Metrics
- Export generation time < 5s for 1000 records
- Email delivery within 30 seconds
- Zero data leaks (user isolation)

---

## 🔴 Issue #6: Two-Factor Authentication (2FA)

**Labels:** `priority: high` `difficulty: hard` `type: security` `area: authentication` `good-first-issue: no`

### 📋 Description
Implement TOTP-based two-factor authentication for enhanced account security. Users can enable 2FA by scanning a QR code with authenticator apps like Google Authenticator or Authy. Backup codes provided for account recovery.

### 🎯 Business Value
- Reduce account takeover incidents by 99%
- Meet security compliance requirements
- Increase user trust and confidence
- Enable enterprise customer adoption

### 📝 Requirements
1. Generate TOTP secrets and QR codes for 2FA setup
2. Verify TOTP codes on login (6-digit codes)
3. Provide 10 single-use backup codes
4. Allow 2FA disable with password + current TOTP code
5. Track 2FA status in user model
6. Enforce 2FA for admin accounts
7. Add 2FA recovery flow with backup codes
8. Log all 2FA events (enable, disable, failed attempts)

### ✅ Acceptance Criteria
- [ ] POST /api/auth/2fa/enable - Enable 2FA, return QR code
- [ ] POST /api/auth/2fa/verify - Verify TOTP code
- [ ] POST /api/auth/2fa/disable - Disable 2FA (requires password + TOTP)
- [ ] GET /api/auth/2fa/backup-codes - Generate new backup codes
- [ ] Login requires TOTP code if 2FA enabled
- [ ] Backup codes work for login (single-use)
- [ ] Failed TOTP attempts rate limited (5 per 15 min)
- [ ] Tests cover all 2FA flows
- [ ] Documentation includes setup guide with screenshots

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

### 🗄️ Database Migration
```sql
ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(32);
ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN backup_codes TEXT[];
ALTER TABLE users ADD COLUMN two_factor_enabled_at TIMESTAMP;

CREATE INDEX idx_users_2fa_enabled ON users(two_factor_enabled) WHERE two_factor_enabled = true;
```

### 🔧 Implementation Guide

**QR Code Generation:**
```javascript
const secret = speakeasy.generateSecret({ name: 'Tagged (@username)' });
const qrCode = await qrcode.toDataURL(secret.otpauth_url);
```

**TOTP Verification:**
```javascript
const verified = speakeasy.totp.verify({
  secret: user.two_factor_secret,
  encoding: 'base32',
  token: userProvidedCode,
  window: 2 // Allow 60s time drift
});
```

### 🧪 Testing Requirements
- Test TOTP generation and verification
- Test backup code generation (10 codes)
- Test backup code usage (single-use)
- Test 2FA disable flow
- Test rate limiting on failed attempts

### 📊 Success Metrics
- 2FA adoption rate > 30% within 3 months
- Zero account takeovers with 2FA enabled
- Failed TOTP rate < 5%

---

## 🟡 Issue #7: Analytics Dashboard API

**Labels:** `priority: medium` `difficulty: medium` `type: feature` `area: analytics` `good-first-issue: no`

### 📋 Description
Create API endpoints to power an analytics dashboard showing transaction metrics, trends, and insights. Provides aggregated data for volume, transaction counts, token distribution, and chain usage with caching for performance.

### 🎯 Business Value
- Enable data-driven decision making
- Provide user insights for retention
- Support business intelligence needs
- Attract enterprise customers

### 📝 Requirements
1. Total transaction volume by period (day/week/month)
2. Transaction count by status (completed, pending, failed)
3. Top tokens by volume and transaction count
4. Top chains by transaction count
5. Average transaction value over time
6. Daily/weekly/monthly aggregations
7. Cache results for 5 minutes
8. Support date range filtering
9. User-specific and global analytics

### ✅ Acceptance Criteria
- [ ] GET /api/analytics/overview - Summary statistics
- [ ] GET /api/analytics/volume?period=daily&from=2024-01-01&to=2024-12-31
- [ ] GET /api/analytics/tokens - Token breakdown
- [ ] GET /api/analytics/chains - Chain breakdown
- [ ] Support date range filtering on all endpoints
- [ ] Results cached for 5 minutes in Redis
- [ ] Tests verify calculation accuracy
- [ ] Documentation includes response examples

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

### 📝 Files to Modify
```
backend/
├── server.js                    # Register analytics routes
└── middleware/
    └── cacheMiddleware.js       # Use for caching
```

### 🔧 Implementation Guide

**Response Format:**
```json
{
  "overview": {
    "totalVolume": 1250000.50,
    "totalTransactions": 5420,
    "averageValue": 230.55,
    "successRate": 98.5
  },
  "volumeByDay": [
    { "date": "2024-02-20", "volume": 45000.00, "count": 120 },
    { "date": "2024-02-21", "volume": 52000.00, "count": 135 }
  ],
  "topTokens": [
    { "symbol": "XLM", "volume": 500000.00, "count": 2500 },
    { "symbol": "USDC", "volume": 400000.00, "count": 1800 }
  ]
}
```

### 🧪 Testing Requirements
- Test volume calculations
- Test aggregation by period
- Test cache hit/miss
- Test date range filtering

### 📊 Success Metrics
- Query response time < 100ms (cached)
- Cache hit rate > 90%
- Calculation accuracy 100%

---

## 🟡 Issue #8: Batch Payment Processing

**Labels:** `priority: medium` `difficulty: hard` `type: feature` `area: payments` `good-first-issue: no`

### 📋 Description
Allow users to process multiple payments in a single request for efficiency. Useful for payroll, airdrops, and bulk transfers. Supports parallel processing with configurable concurrency limits and partial success handling.

### 🎯 Business Value
- Enable payroll and bulk payment use cases
- Reduce API calls by 95% for bulk operations
- Attract business customers
- Improve user efficiency

### 📝 Requirements
1. Accept array of payment requests (max 50 per batch)
2. Process payments in parallel with concurrency limit (5 concurrent)
3. Return individual results for each payment
4. Support two failure modes: "abort" (rollback all) or "continue" (partial success)
5. Track batch processing status
6. Queue large batches as background jobs
7. Provide batch status endpoint
8. Calculate total fees upfront

### ✅ Acceptance Criteria
- [ ] POST /api/transactions/batch - Process batch payment
- [ ] GET /api/transactions/batch/:id - Get batch status
- [ ] Each payment validated independently
- [ ] Partial success supported (configurable via failureMode)
- [ ] Batch processing uses BullMQ queue
- [ ] Tests cover success/failure scenarios
- [ ] Documentation includes request/response examples
- [ ] Rate limit: 10 batches per hour per user

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

### 📝 Files to Modify
```
backend/
├── server.js                    # Register batch routes
└── services/
    └── PaymentService.js        # Reuse for individual payments
```

### 🗄️ Database Schema
```sql
CREATE TABLE batch_payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total_payments INTEGER NOT NULL,
  successful_payments INTEGER DEFAULT 0,
  failed_payments INTEGER DEFAULT 0,
  total_amount DECIMAL(20, 8),
  total_fees DECIMAL(20, 8),
  status VARCHAR(20) DEFAULT 'pending',
  failure_mode VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_batch_payments_user_id ON batch_payments(user_id);
CREATE INDEX idx_batch_payments_status ON batch_payments(status);
```

### 🔧 Implementation Guide

**Request Format:**
```json
{
  "payments": [
    { "recipientTag": "@user1", "amount": 100, "asset": "XLM", "memo": "Payment 1" },
    { "recipientTag": "@user2", "amount": 200, "asset": "XLM", "memo": "Payment 2" }
  ],
  "failureMode": "continue"
}
```

**Response Format:**
```json
{
  "batchId": 123,
  "status": "processing",
  "totalPayments": 2,
  "results": [
    { "index": 0, "status": "success", "transactionId": 456 },
    { "index": 1, "status": "failed", "error": "Insufficient funds" }
  ]
}
```

### 🧪 Testing Requirements
- Test batch with all successful payments
- Test batch with partial failures (continue mode)
- Test batch with failure (abort mode)
- Test concurrency limits
- Test batch size limits (max 50)

### 📊 Success Metrics
- Batch processing time < 10s for 50 payments
- Success rate > 95%
- Concurrency limit prevents overload

---

## 🟡 Issue #9: API Versioning

**Labels:** `priority: medium` `difficulty: medium` `type: architecture` `area: api` `good-first-issue: no`

### 📋 Description
Add API versioning to support backward compatibility and smooth migrations when making breaking changes. Implements URL-based versioning (/api/v1/, /api/v2/) with deprecation warnings and migration guides.

### 🎯 Business Value
- Enable API evolution without breaking clients
- Support multiple client versions simultaneously
- Reduce integration friction for partners
- Professional API management

### 📝 Requirements
1. Support v1 and v2 API versions
2. Version specified in URL path (/api/v1/, /api/v2/)
3. Maintain v1 endpoints during transition period (6 months)
4. Add deprecation warnings to v1 responses
5. Document version differences
6. Add version detection middleware
7. Create migration guide for v1 to v2
8. Set sunset date for v1 (6 months from v2 launch)

### ✅ Acceptance Criteria
- [ ] All routes support /api/v1/ prefix
- [ ] New v2 routes created for changed endpoints
- [ ] Middleware detects and validates version
- [ ] Deprecation headers added to v1 (X-API-Deprecation, X-API-Sunset)
- [ ] Tests cover both versions
- [ ] Migration guide created with examples
- [ ] Documentation updated with version info
- [ ] Version mismatch returns 400 with helpful message

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
├── routes/*.js                  # Organize into v1/v2
└── docs/
    └── API_MIGRATION_V1_TO_V2.md
```

### 🔧 Implementation Guide

**Version Middleware:**
```javascript
// middleware/versionMiddleware.js
export const versionMiddleware = (req, res, next) => {
  const version = req.path.match(/^\/api\/(v\d+)\//)?.[1];
  
  if (!version) {
    return res.status(400).json({ error: 'API version required in path' });
  }
  
  req.apiVersion = version;
  
  if (version === 'v1') {
    res.set('X-API-Deprecation', 'v1 is deprecated');
    res.set('X-API-Sunset', '2024-08-21');
  }
  
  next();
};
```

**Server Setup:**
```javascript
import v1Routes from './routes/v1/index.js';
import v2Routes from './routes/v2/index.js';

app.use('/api/v1', versionMiddleware, v1Routes);
app.use('/api/v2', versionMiddleware, v2Routes);
```

### 🧪 Testing Requirements
- Test v1 endpoints return deprecation headers
- Test v2 endpoints work correctly
- Test invalid version returns 400
- Test version detection middleware

### 📊 Success Metrics
- Zero breaking changes for v1 clients
- 80% client migration to v2 within 3 months
- Clear migration path documented

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
