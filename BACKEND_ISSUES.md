# Backend Issues for Contributors

This document contains high-quality backend issues that contributors can work on. Each issue includes clear requirements, acceptance criteria, and implementation guidance.

---

## Issue #1: Implement Redis Caching Layer for Balance Queries

**Priority:** High  
**Difficulty:** Medium  
**Labels:** `enhancement`, `performance`, `caching`

### Description
Currently, balance queries hit the database on every request. Implement a Redis caching layer to improve performance and reduce database load.

### Requirements
- Cache user balances with 60-second TTL
- Invalidate cache on balance updates
- Add cache hit/miss metrics
- Implement cache warming for active users
- Add Redis connection health checks

### Acceptance Criteria
- [ ] Balance queries check Redis before database
- [ ] Cache invalidation works on transactions
- [ ] Cache TTL is configurable via environment variable
- [ ] Metrics show cache hit rate
- [ ] Tests cover cache scenarios
- [ ] Documentation updated

### Files to Modify
- `services/BalanceService.js`
- `config/redis.js`
- `middleware/cacheMiddleware.js` (create)

### Technical Notes
```javascript
// Example implementation
const cacheKey = `balance:${userId}:${chainId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

const balance = await db.query(...);
await redis.setex(cacheKey, 60, JSON.stringify(balance));
```

---

## Issue #2: Add Webhook System for Transaction Events

**Priority:** High  
**Difficulty:** Medium  
**Labels:** `feature`, `webhooks`, `notifications`

### Description
Implement a webhook system to notify external services about transaction events (created, completed, failed).

### Requirements
- Support multiple webhook URLs per user
- Retry failed webhook deliveries (3 attempts)
- Sign webhook payloads with HMAC
- Store webhook delivery logs
- Add webhook management endpoints

### Acceptance Criteria
- [ ] POST /api/webhooks - Register webhook
- [ ] GET /api/webhooks - List webhooks
- [ ] DELETE /api/webhooks/:id - Remove webhook
- [ ] Webhooks fire on transaction status changes
- [ ] Failed deliveries retry with exponential backoff
- [ ] Webhook signatures can be verified
- [ ] Tests cover all webhook scenarios

### Files to Create
- `services/WebhookService.js`
- `controllers/webhookController.js`
- `routes/webhooks.js`
- `models/Webhook.js`
- `queues/webhookQueue.js`

### Database Schema
```sql
CREATE TABLE webhooks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  url VARCHAR(500) NOT NULL,
  secret VARCHAR(64) NOT NULL,
  events TEXT[] NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
  id SERIAL PRIMARY KEY,
  webhook_id INTEGER REFERENCES webhooks(id),
  event_type VARCHAR(50),
  payload JSONB,
  status VARCHAR(20),
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Issue #3: Implement Rate Limiting with Redis

**Priority:** High  
**Difficulty:** Easy  
**Labels:** `security`, `rate-limiting`, `redis`

### Description
Add Redis-backed rate limiting to prevent API abuse and ensure fair usage.

### Requirements
- Different limits for authenticated vs unauthenticated users
- Per-endpoint rate limits
- Return rate limit headers in responses
- Configurable limits via environment variables
- Whitelist for trusted IPs

### Acceptance Criteria
- [ ] Rate limiting active on all API endpoints
- [ ] Headers include X-RateLimit-* information
- [ ] 429 status returned when limit exceeded
- [ ] Admin endpoints have stricter limits
- [ ] Tests verify rate limiting behavior
- [ ] Documentation includes rate limit info

### Files to Modify
- `middleware/rateLimiter.js` (create)
- `server.js`
- `.env.example`

### Configuration
```javascript
// Rate limit tiers
const limits = {
  anonymous: { windowMs: 15 * 60 * 1000, max: 100 },
  authenticated: { windowMs: 15 * 60 * 1000, max: 1000 },
  admin: { windowMs: 15 * 60 * 1000, max: 5000 }
};
```

---

## Issue #4: Add Comprehensive API Request Logging

**Priority:** Medium  
**Difficulty:** Easy  
**Labels:** `logging`, `monitoring`, `observability`

### Description
Implement structured logging for all API requests with correlation IDs for request tracing.

### Requirements
- Log all incoming requests with method, path, status, duration
- Generate unique correlation ID per request
- Include user ID in logs (if authenticated)
- Log request/response bodies for errors
- Integrate with Pino logger
- Add log rotation

### Acceptance Criteria
- [ ] All requests logged with correlation ID
- [ ] Logs include timing information
- [ ] Error logs include stack traces
- [ ] Logs are structured JSON
- [ ] Sensitive data (passwords, tokens) redacted
- [ ] Log level configurable via environment

### Files to Modify
- `middleware/requestLogger.js` (create)
- `utils/logger.js`
- `server.js`

### Example Log Format
```json
{
  "level": "info",
  "time": "2024-02-21T10:30:00.000Z",
  "correlationId": "abc-123-def",
  "userId": 42,
  "method": "POST",
  "path": "/api/transactions",
  "statusCode": 201,
  "duration": 145,
  "userAgent": "Mozilla/5.0..."
}
```

---

## Issue #5: Implement Transaction Export Feature

**Priority:** Medium  
**Difficulty:** Medium  
**Labels:** `feature`, `export`, `reporting`

### Description
Allow users to export their transaction history in CSV and PDF formats.

### Requirements
- Export transactions as CSV
- Export transactions as PDF with branding
- Filter by date range, status, chain
- Queue large exports as background jobs
- Email download link when ready
- Expire export files after 24 hours

### Acceptance Criteria
- [ ] GET /api/transactions/export?format=csv
- [ ] GET /api/transactions/export?format=pdf
- [ ] Exports respect user permissions
- [ ] Large exports processed in background
- [ ] Email notification sent when ready
- [ ] Tests cover both formats
- [ ] Documentation includes examples

### Files to Create
- `services/ExportService.js`
- `controllers/exportController.js`
- `queues/exportQueue.js`
- `utils/pdfGenerator.js`
- `utils/csvGenerator.js`

### Dependencies
```json
{
  "pdfkit": "^0.17.2",
  "csv-stringify": "^6.4.0"
}
```

---

## Issue #6: Add Two-Factor Authentication (2FA)

**Priority:** High  
**Difficulty:** Hard  
**Labels:** `security`, `authentication`, `2fa`

### Description
Implement TOTP-based two-factor authentication for enhanced account security.

### Requirements
- Generate QR codes for 2FA setup
- Verify TOTP codes on login
- Provide backup codes (10 codes)
- Allow 2FA disable with password confirmation
- Track 2FA status in user model
- Add 2FA enforcement for admin accounts

### Acceptance Criteria
- [ ] POST /api/auth/2fa/enable - Enable 2FA
- [ ] POST /api/auth/2fa/verify - Verify TOTP code
- [ ] POST /api/auth/2fa/disable - Disable 2FA
- [ ] GET /api/auth/2fa/backup-codes - Get backup codes
- [ ] Login requires 2FA code if enabled
- [ ] Backup codes work for login
- [ ] Tests cover all 2FA flows
- [ ] Documentation includes setup guide

### Files to Create
- `services/TwoFactorService.js`
- `controllers/twoFactorController.js`
- `routes/twoFactor.js`

### Database Migration
```sql
ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(32);
ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN backup_codes TEXT[];
```

### Dependencies
```json
{
  "speakeasy": "^2.0.0",
  "qrcode": "^1.5.4"
}
```

---

## Issue #7: Implement Transaction Analytics Dashboard API

**Priority:** Medium  
**Difficulty:** Medium  
**Labels:** `feature`, `analytics`, `dashboard`

### Description
Create API endpoints to power an analytics dashboard showing transaction metrics and trends.

### Requirements
- Total transaction volume by period
- Transaction count by status
- Top tokens by volume
- Top chains by transaction count
- Average transaction value
- Daily/weekly/monthly aggregations
- Cache results for performance

### Acceptance Criteria
- [ ] GET /api/analytics/overview - Summary stats
- [ ] GET /api/analytics/volume - Volume over time
- [ ] GET /api/analytics/tokens - Token breakdown
- [ ] GET /api/analytics/chains - Chain breakdown
- [ ] Support date range filtering
- [ ] Results cached for 5 minutes
- [ ] Tests verify calculations
- [ ] Documentation includes response examples

### Files to Create
- `services/AnalyticsService.js`
- `controllers/analyticsController.js`
- `routes/analytics.js`

### Example Response
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
  ]
}
```

---

## Issue #8: Add Batch Payment Processing

**Priority:** Medium  
**Difficulty:** Hard  
**Labels:** `feature`, `payments`, `batch-processing`

### Description
Allow users to process multiple payments in a single request for efficiency.

### Requirements
- Accept array of payment requests
- Process payments in parallel (with concurrency limit)
- Return individual results for each payment
- Rollback all if any critical failure
- Add batch payment limits (max 50 per batch)
- Track batch processing status

### Acceptance Criteria
- [ ] POST /api/transactions/batch - Process batch
- [ ] GET /api/transactions/batch/:id - Get batch status
- [ ] Each payment validated independently
- [ ] Partial success supported (configurable)
- [ ] Batch processing uses queue
- [ ] Tests cover success/failure scenarios
- [ ] Documentation includes examples

### Files to Create
- `services/BatchPaymentService.js`
- `controllers/batchPaymentController.js`
- `queues/batchPaymentQueue.js`
- `models/BatchPayment.js`

### Request Format
```json
{
  "payments": [
    {
      "recipientTag": "@user1",
      "amount": 100,
      "asset": "XLM",
      "memo": "Payment 1"
    },
    {
      "recipientTag": "@user2",
      "amount": 200,
      "asset": "XLM",
      "memo": "Payment 2"
    }
  ],
  "failureMode": "continue" // or "abort"
}
```

---

## Issue #9: Implement API Versioning

**Priority:** Medium  
**Difficulty:** Medium  
**Labels:** `architecture`, `api`, `versioning`

### Description
Add API versioning to support backward compatibility and smooth migrations.

### Requirements
- Support v1 and v2 API versions
- Version specified in URL path (/api/v1/, /api/v2/)
- Maintain v1 endpoints during transition
- Add deprecation warnings to v1 responses
- Document version differences
- Add version detection middleware

### Acceptance Criteria
- [ ] All routes support /api/v1/ prefix
- [ ] New v2 routes created for changed endpoints
- [ ] Middleware detects and validates version
- [ ] Deprecation headers added to v1
- [ ] Tests cover both versions
- [ ] Migration guide created
- [ ] Documentation updated

### Files to Modify
- `routes/*.js` (all route files)
- `middleware/versionMiddleware.js` (create)
- `server.js`

### Implementation Strategy
```javascript
// Version middleware
app.use('/api/v1', v1Routes);
app.use('/api/v2', v2Routes);

// Deprecation header
res.set('X-API-Deprecation', 'v1 will be sunset on 2024-12-31');
```

---

## Getting Started

1. **Choose an issue** that matches your skill level
2. **Comment on the issue** to claim it
3. **Fork the repository** and create a feature branch
4. **Implement the solution** following the acceptance criteria
5. **Write tests** to cover your changes
6. **Update documentation** as needed
7. **Submit a pull request** with a clear description

## Questions?

- Check the [CONTRIBUTING.md](../CONTRIBUTING.md) guide
- Review existing code for patterns
- Ask questions in issue comments
- Join our community discussions

Happy coding! 🚀
