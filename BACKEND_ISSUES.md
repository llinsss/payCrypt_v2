# Tagged Backend - Contributor Issues

This document contains 44 high-quality backend issues for contributors to work on. Issues are categorized by priority and complexity.

---

## 🔴 Critical Priority Issues

### Issue #1: Implement Transaction Rollback Mechanism
**Priority:** Critical | **Difficulty:** Hard | **Type:** Bug Fix

**Labels:** `critical`, `bug`, `security`

**Description:**
The current payment processing doesn't properly handle failed Stellar transactions. If a transaction fails after database commit, funds can be lost or double-counted.

**Tasks:**
- Add transaction rollback logic in PaymentService
- Implement compensation transactions for failed payments
- Add idempotency keys to prevent duplicate processing
- Create audit log for failed transactions

**Files to modify:**
- `backend/services/PaymentService.js`
- `backend/models/Transaction.js`

---

### Issue #2: Add Database Connection Pooling Configuration
**Priority:** Critical | **Difficulty:** Medium | **Type:** Performance

**Labels:** `critical`, `performance`, `infrastructure`

**Description:**
Database connections are not properly pooled, leading to connection exhaustion under load.

**Tasks:**
- Configure Knex connection pool settings
- Add connection timeout handling
- Implement connection health checks
- Add metrics for pool utilization

**Files to modify:**
- `backend/config/database.js`
- `backend/knexfile.js`

---

### Issue #3: Implement Rate Limiting Per User
**Priority:** Critical | **Difficulty:** Medium | **Type:** Security

**Labels:** `critical`, `security`, `performance`

**Description:**
Current rate limiting is global. Need per-user rate limiting to prevent abuse.

**Tasks:**
- Add user-based rate limiting middleware
- Store rate limit counters in Redis
- Implement sliding window algorithm
- Add rate limit headers to responses

**Files to modify:**
- `backend/config/rateLimiting.js`
- `backend/middleware/auth.js`

---

### Issue #4: Add Input Sanitization for SQL Injection Prevention
**Priority:** Critical | **Difficulty:** Medium | **Type:** Security

**Labels:** `critical`, `security`, `bug`

**Description:**
Some raw queries don't use parameterized statements, creating SQL injection vulnerabilities.

**Tasks:**
- Audit all database queries
- Replace string concatenation with parameterized queries
- Add SQL injection tests
- Implement query validation middleware

**Files to modify:**
- `backend/models/*.js`
- `backend/middleware/validation.js`

---

## 🟠 High Priority Issues

### Issue #5: Implement Webhook System for Transaction Events
**Priority:** High | **Difficulty:** Hard | **Type:** Feature

**Labels:** `high-priority`, `enhancement`, `feature`

**Description:**
Add webhook system to notify external services of transaction events.

**Tasks:**
- Create webhook registration endpoints
- Implement webhook delivery queue
- Add retry logic with exponential backoff
- Create webhook signature verification
- Add webhook event types (payment.completed, payment.failed, etc.)

**Files to create:**
- `backend/services/WebhookService.js`
- `backend/controllers/webhookController.js`
- `backend/routes/webhooks.js`
- `backend/queues/webhook.js`

---

### Issue #6: Add Transaction Caching Layer
**Priority:** High | **Difficulty:** Medium | **Type:** Performance

**Labels:** `high-priority`, `performance`, `enhancement`

**Description:**
Frequently accessed transactions should be cached to reduce database load.

**Tasks:**
- Implement Redis caching for transactions
- Add cache invalidation on updates
- Set appropriate TTL values
- Add cache hit/miss metrics

**Files to modify:**
- `backend/models/Transaction.js`
- `backend/config/redis.js`

---

### Issue #7: Implement Multi-Currency Support
**Priority:** High | **Difficulty:** Hard | **Type:** Feature

**Labels:** `high-priority`, `enhancement`, `feature`

**Description:**
Add support for multiple fiat currencies (USD, EUR, GBP, NGN) with real-time conversion.

**Tasks:**
- Create currency conversion service
- Add currency preference to user model
- Update balance calculations
- Add currency conversion API endpoints
- Implement exchange rate caching

**Files to modify:**
- `backend/models/User.js`
- `backend/models/Balance.js`
- `backend/services/exchange-rate-api.js`

---

### Issue #8: Add Transaction Export Functionality
**Priority:** High | **Difficulty:** Medium | **Type:** Feature

**Labels:** `high-priority`, `enhancement`, `feature`

**Description:**
Users need to export transaction history in CSV/PDF formats for accounting.

**Tasks:**
- Create export service
- Add CSV generation
- Add PDF generation with formatting
- Implement background job for large exports
- Add email delivery for completed exports

**Files to create:**
- `backend/services/ExportService.js`
- `backend/controllers/exportController.js`
- `backend/queues/export.js`

---

### Issue #9: Implement API Versioning
**Priority:** High | **Difficulty:** Medium | **Type:** Architecture

**Labels:** `high-priority`, `enhancement`, `architecture`

**Description:**
Add API versioning to support backward compatibility.

**Tasks:**
- Implement version routing (v1, v2)
- Add version detection middleware
- Create deprecation warnings
- Document version differences

**Files to modify:**
- `backend/routes/index.js`
- `backend/app.js`

---

### Issue #10: Add Comprehensive Error Logging
**Priority:** High | **Difficulty:** Medium | **Type:** Monitoring

**Labels:** `high-priority`, `monitoring`, `enhancement`

**Description:**
Implement structured error logging with context and stack traces.

**Tasks:**
- Integrate error tracking service (Sentry/Rollbar)
- Add error context (user, request, environment)
- Implement error grouping
- Add error notification alerts

**Files to modify:**
- `backend/utils/logger.js`
- `backend/app.js`

---

## 🟡 Medium Priority Issues

### Issue #11: Implement Balance Reconciliation Job
**Priority:** Medium | **Difficulty:** Hard | **Type:** Feature

**Labels:** `medium-priority`, `enhancement`, `feature`

**Description:**
Create scheduled job to reconcile on-chain balances with database records.

**Tasks:**
- Create reconciliation worker
- Compare on-chain vs database balances
- Generate discrepancy reports
- Add auto-correction for minor differences
- Send alerts for major discrepancies

**Files to create:**
- `backend/workers/reconciliation.js`
- `backend/services/ReconciliationService.js`

---

### Issue #12: Add Transaction Search Functionality
**Priority:** Medium | **Difficulty:** Medium | **Type:** Feature

**Labels:** `medium-priority`, `enhancement`, `feature`

**Description:**
Implement full-text search for transactions by reference, memo, address.

**Tasks:**
- Add search endpoint
- Implement query optimization
- Add search filters (date range, amount range, status)
- Add pagination for search results

**Files to modify:**
- `backend/controllers/transactionController.js`
- `backend/models/Transaction.js`

---

### Issue #13: Implement Request ID Tracking
**Priority:** Medium | **Difficulty:** Easy | **Type:** Monitoring

**Labels:** `medium-priority`, `monitoring`, `good-first-issue`

**Description:**
Add unique request IDs to track requests across services.

**Tasks:**
- Generate unique request IDs
- Add to all log entries
- Include in response headers
- Add to error messages

**Files to modify:**
- `backend/middleware/performance.js`
- `backend/utils/request-id.js`
- `backend/utils/logger.js`

---

### Issue #14: Add Health Check Endpoints
**Priority:** Medium | **Difficulty:** Easy | **Type:** Monitoring

**Labels:** `medium-priority`, `monitoring`, `good-first-issue`

**Description:**
Implement comprehensive health checks for all dependencies.

**Tasks:**
- Check database connectivity
- Check Redis connectivity
- Check external API availability
- Add readiness and liveness probes
- Return detailed health status

**Files to modify:**
- `backend/controllers/healthController.js`
- `backend/utils/dbHealth.js`

---

### Issue #15: Implement Transaction Batching
**Priority:** Medium | **Difficulty:** Hard | **Type:** Performance

**Labels:** `medium-priority`, `performance`, `enhancement`

**Description:**
Allow users to batch multiple payments into single transaction.

**Tasks:**
- Create batch payment endpoint
- Implement atomic batch processing
- Add batch validation
- Handle partial failures
- Add batch status tracking

**Files to create:**
- `backend/services/BatchPaymentService.js`
- `backend/controllers/batchController.js`

---

### Issue #16: Add Transaction Scheduling
**Priority:** Medium | **Difficulty:** Medium | **Type:** Feature

**Labels:** `medium-priority`, `enhancement`, `feature`

**Description:**
Allow users to schedule payments for future execution.

**Tasks:**
- Create scheduled payment model
- Add scheduling endpoint
- Implement cron job for execution
- Add cancellation functionality
- Send notifications before execution

**Files to create:**
- `backend/models/ScheduledPayment.js`
- `backend/workers/scheduler.js`

---

### Issue #17: Implement Gas Fee Estimation
**Priority:** Medium | **Difficulty:** Medium | **Type:** Feature

**Labels:** `medium-priority`, `enhancement`, `feature`

**Description:**
Provide accurate gas fee estimates before transaction submission.

**Tasks:**
- Create fee estimation service
- Query current network fees
- Add fee tier options (slow, normal, fast)
- Cache fee estimates
- Update estimates periodically

**Files to create:**
- `backend/services/FeeEstimationService.js`

---

### Issue #18: Add Transaction Analytics Dashboard Data
**Priority:** Medium | **Difficulty:** Medium | **Type:** Feature

**Labels:** `medium-priority`, `enhancement`, `feature`

**Description:**
Create endpoints for transaction analytics and statistics.

**Tasks:**
- Add daily/weekly/monthly transaction volume
- Calculate average transaction size
- Track transaction success rate
- Add user growth metrics
- Implement time-series data aggregation

**Files to create:**
- `backend/controllers/analyticsController.js`
- `backend/services/AnalyticsService.js`

---

### Issue #19: Implement API Response Compression
**Priority:** Medium | **Difficulty:** Easy | **Type:** Performance

**Description:**
Add response compression to reduce bandwidth usage.

**Tasks:**
- Configure compression middleware
- Set compression thresholds
- Add compression headers
- Test compression ratios

**Files to modify:**
- `backend/app.js`

---

### Issue #20: Add Database Migration Rollback Scripts
**Priority:** Medium | **Difficulty:** Medium | **Type:** DevOps

**Description:**
Create rollback scripts for all database migrations.

**Tasks:**
- Add down() methods to all migrations
- Test rollback procedures
- Document rollback process
- Add migration version tracking

**Files to modify:**
- `backend/migrations/*.js`

---

## 🟢 Low Priority Issues

### Issue #21: Implement Notification Preferences
**Priority:** Low | **Difficulty:** Medium | **Type:** Feature

**Description:**
Allow users to customize notification preferences.

**Tasks:**
- Add notification preferences model
- Create preference management endpoints
- Implement preference checking before sending
- Add notification channels (email, SMS, push)

**Files to modify:**
- `backend/models/User.js`
- `backend/controllers/notificationController.js`

---

### Issue #22: Add API Documentation with Swagger
**Priority:** Low | **Difficulty:** Medium | **Type:** Documentation

**Description:**
Generate interactive API documentation using Swagger/OpenAPI.

**Tasks:**
- Install swagger-jsdoc and swagger-ui-express
- Add JSDoc comments to routes
- Configure Swagger UI
- Add authentication to docs
- Deploy docs endpoint

**Files to modify:**
- `backend/routes/*.js`
- `backend/app.js`

---

### Issue #23: Implement Request Validation Middleware
**Priority:** Low | **Difficulty:** Easy | **Type:** Quality

**Description:**
Add comprehensive request validation for all endpoints.

**Tasks:**
- Create validation schemas for all endpoints
- Add validation middleware
- Return detailed validation errors
- Add validation tests

**Files to modify:**
- `backend/schemas/*.js`
- `backend/middleware/validation.js`

---

### Issue #24: Add Database Query Performance Monitoring
**Priority:** Low | **Difficulty:** Medium | **Type:** Monitoring

**Description:**
Track slow queries and database performance metrics.

**Tasks:**
- Add query execution time logging
- Identify slow queries
- Add query performance alerts
- Create performance dashboard

**Files to modify:**
- `backend/config/database.js`
- `backend/utils/logger.js`

---

### Issue #25: Implement Soft Delete for Transactions
**Priority:** Low | **Difficulty:** Easy | **Type:** Feature

**Description:**
Add soft delete functionality instead of hard deletes.

**Tasks:**
- Add deleted_at column to transactions
- Update delete methods
- Filter deleted records in queries
- Add restore functionality

**Files to modify:**
- `backend/models/Transaction.js`
- `backend/migrations/` (new migration)

---

### Issue #26: Add Transaction Tags/Labels
**Priority:** Low | **Difficulty:** Medium | **Type:** Feature

**Description:**
Allow users to tag transactions for organization.

**Tasks:**
- Create tags model
- Add tag management endpoints
- Implement tag filtering
- Add tag autocomplete

**Files to create:**
- `backend/models/Tag.js`
- `backend/controllers/tagController.js`

---

### Issue #27: Implement API Key Rotation
**Priority:** Low | **Difficulty:** Medium | **Type:** Security

**Description:**
Add automatic API key rotation for enhanced security.

**Tasks:**
- Create key rotation schedule
- Add rotation notification
- Support multiple active keys during transition
- Add rotation audit log

**Files to modify:**
- `backend/models/ApiKey.js`
- `backend/controllers/apiKeyController.js`

---

### Issue #28: Add Transaction Notes/Comments
**Priority:** Low | **Difficulty:** Easy | **Type:** Feature

**Description:**
Allow users to add private notes to transactions.

**Tasks:**
- Add notes field to transactions
- Create note update endpoint
- Add note search functionality
- Limit note length

**Files to modify:**
- `backend/models/Transaction.js`
- `backend/controllers/transactionController.js`

---

### Issue #29: Implement Email Template System
**Priority:** Low | **Difficulty:** Medium | **Type:** Feature

**Description:**
Create reusable email templates with variable substitution.

**Tasks:**
- Create template engine
- Design email templates
- Add template management
- Support multiple languages

**Files to modify:**
- `backend/services/external/smtp.js`

---

### Issue #30: Add Transaction Dispute System
**Priority:** Low | **Difficulty:** Hard | **Type:** Feature

**Description:**
Allow users to dispute transactions and track resolution.

**Tasks:**
- Create dispute model
- Add dispute submission endpoint
- Implement dispute workflow
- Add admin dispute management
- Send dispute notifications

**Files to create:**
- `backend/models/Dispute.js`
- `backend/controllers/disputeController.js`

---

## 🔵 Enhancement Issues

### Issue #31: Optimize Balance Query Performance
**Priority:** Enhancement | **Difficulty:** Medium | **Type:** Performance

**Description:**
Balance queries with joins are slow. Add database indexes and query optimization.

**Tasks:**
- Add composite indexes
- Optimize JOIN queries
- Add query result caching
- Benchmark performance improvements

**Files to modify:**
- `backend/models/Balance.js`
- `backend/migrations/` (new migration for indexes)

---

### Issue #32: Add GraphQL API Support
**Priority:** Enhancement | **Difficulty:** Hard | **Type:** Feature

**Description:**
Implement GraphQL API alongside REST for flexible querying.

**Tasks:**
- Install Apollo Server
- Define GraphQL schema
- Create resolvers
- Add authentication
- Add query complexity limits

**Files to create:**
- `backend/graphql/schema.js`
- `backend/graphql/resolvers.js`

---

### Issue #33: Implement Redis Pub/Sub for Real-time Updates
**Priority:** Enhancement | **Difficulty:** Medium | **Type:** Feature

**Description:**
Use Redis pub/sub for real-time transaction updates.

**Tasks:**
- Configure Redis pub/sub
- Publish transaction events
- Create subscription handlers
- Add WebSocket support

**Files to modify:**
- `backend/config/redis.js`
- `backend/services/PaymentService.js`

---

### Issue #34: Add Transaction Receipt Generation
**Priority:** Enhancement | **Difficulty:** Medium | **Type:** Feature

**Description:**
Generate PDF receipts for completed transactions.

**Tasks:**
- Create receipt template
- Add PDF generation library
- Include QR code with transaction hash
- Add receipt download endpoint

**Files to create:**
- `backend/services/ReceiptService.js`

---

### Issue #35: Implement Two-Factor Authentication
**Priority:** Enhancement | **Difficulty:** Medium | **Type:** Security

**Description:**
Add 2FA for sensitive operations like withdrawals.

**Tasks:**
- Add TOTP support
- Create 2FA setup endpoints
- Require 2FA for withdrawals
- Add backup codes

**Files to modify:**
- `backend/models/User.js`
- `backend/controllers/authController.js`

---

### Issue #36: Add Blockchain Explorer Links
**Priority:** Enhancement | **Difficulty:** Easy | **Type:** Feature

**Description:**
Generate blockchain explorer links for transactions.

**Tasks:**
- Create link generation utility
- Add explorer URLs for each chain
- Include in transaction responses
- Add to email notifications

**Files to create:**
- `backend/utils/explorer.js`

---

### Issue #37: Implement Transaction Filtering by Amount Range
**Priority:** Enhancement | **Difficulty:** Easy | **Type:** Feature

**Description:**
Add amount range filtering to transaction queries.

**Tasks:**
- Add min_amount and max_amount query params
- Update transaction query builder
- Add validation for amount ranges
- Add to API documentation

**Files to modify:**
- `backend/models/Transaction.js`
- `backend/controllers/transactionController.js`

---

### Issue #38: Add Automated Backup System
**Priority:** Enhancement | **Difficulty:** Medium | **Type:** DevOps

**Description:**
Implement automated database backups with retention policy.

**Tasks:**
- Create backup script
- Schedule daily backups
- Implement backup rotation
- Add backup verification
- Store backups securely

**Files to create:**
- `backend/scripts/backup.js`

---

### Issue #39: Implement IP Whitelisting for API Keys
**Priority:** Enhancement | **Difficulty:** Medium | **Type:** Security

**Description:**
Allow API key restrictions by IP address.

**Tasks:**
- Add IP whitelist to API key model
- Validate IP on each request
- Support CIDR notation
- Add IP management endpoints

**Files to modify:**
- `backend/models/ApiKey.js`
- `backend/middleware/apiKeyAuth.js`

---

### Issue #40: Add Transaction Duplicate Detection
**Priority:** Enhancement | **Difficulty:** Medium | **Type:** Quality

**Description:**
Detect and prevent duplicate transaction submissions.

**Tasks:**
- Implement transaction fingerprinting
- Check for duplicates before processing
- Add duplicate detection window
- Return existing transaction if duplicate

**Files to modify:**
- `backend/services/PaymentService.js`

---

### Issue #41: Implement Audit Log System
**Priority:** Enhancement | **Difficulty:** Medium | **Type:** Security

**Description:**
Create comprehensive audit log for all sensitive operations.

**Tasks:**
- Create audit log model
- Log all CRUD operations
- Include user, IP, timestamp
- Add audit log query endpoints
- Implement log retention policy

**Files to create:**
- `backend/models/AuditLog.js`
- `backend/middleware/audit.js`

---

### Issue #42: Add Transaction Status Webhooks
**Priority:** Enhancement | **Difficulty:** Medium | **Type:** Feature

**Description:**
Send webhooks when transaction status changes.

**Tasks:**
- Detect status changes
- Trigger webhook on change
- Include status transition details
- Add retry logic

**Files to modify:**
- `backend/models/Transaction.js`
- `backend/services/WebhookService.js`

---

### Issue #43: Implement Database Connection Retry Logic
**Priority:** Enhancement | **Difficulty:** Easy | **Type:** Reliability

**Description:**
Add automatic retry for failed database connections.

**Tasks:**
- Implement exponential backoff
- Add max retry attempts
- Log retry attempts
- Graceful degradation

**Files to modify:**
- `backend/config/database.js`
- `backend/server.js`

---

### Issue #44: Add Transaction Metadata Support
**Priority:** Enhancement | **Difficulty:** Easy | **Type:** Feature

**Description:**
Allow arbitrary metadata to be attached to transactions.

**Tasks:**
- Add metadata JSON field
- Validate metadata structure
- Add metadata search
- Limit metadata size

**Files to modify:**
- `backend/models/Transaction.js`
- `backend/controllers/transactionController.js`

---

## Contributing Guidelines

### Before Starting Work:
1. Comment on the issue to claim it
2. Fork the repository
3. Create a feature branch: `git checkout -b feature/issue-{number}`
4. Follow the existing code style
5. Write tests for new functionality
6. Update documentation

### Pull Request Requirements:
- Reference the issue number in PR title
- Include test coverage
- Pass all CI checks
- Update CHANGELOG.md
- Add migration scripts if needed

### Code Quality Standards:
- ESLint compliance
- Minimum 80% test coverage
- No console.log in production code
- Proper error handling
- JSDoc comments for functions

---

## Issue Labels

- `critical` - Must be fixed immediately
- `high-priority` - Important for next release
- `medium-priority` - Should be addressed soon
- `low-priority` - Nice to have
- `enhancement` - New feature or improvement
- `bug` - Something isn't working
- `security` - Security-related issue
- `performance` - Performance optimization
- `documentation` - Documentation improvements
- `good-first-issue` - Good for newcomers

---

## Support

For questions about any issue:
- Open a discussion in GitHub Discussions
- Join our Discord server
- Email: dev@taggedpay.xyz

Happy coding! 🚀
