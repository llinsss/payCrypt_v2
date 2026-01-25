# Stellar SDK Database Schema

## Overview
This document describes the PostgreSQL database schema for the Stellar SDK integration, including tables for tag management, account tracking, transaction history, and webhook configurations.

## Connection Configuration

The database connection is configured in `knexfile.js` with the following settings:

- **Client**: PostgreSQL (`pg`)
- **Connection Pool**: Min 2, Max 10 connections
- **Migrations Directory**: `./migrations`
- **Seeds Directory**: `./seeds`

### Environment Variables
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=taggedpay
DB_USER=postgres
DB_PASSWORD=your_password
```

## Database Tables

### 1. stellar_tags
Maps user-friendly tags (@username) to Stellar addresses.

**Columns:**
- `id` (integer, primary key, auto-increment)
- `tag` (string, 20 chars, unique, not null) - User-friendly tag (e.g., @alice)
- `stellar_address` (string, 56 chars, not null) - Stellar public key
- `created_at` (timestamp, default now)
- `updated_at` (timestamp, default now)

**Indexes:**
- `tag` (unique index)
- `stellar_address` (index)

**Migration:** `20260121175000_create_stellar_tags.js`

---

### 2. stellar_accounts
Stores comprehensive Stellar account information.

**Columns:**
- `id` (integer, primary key, auto-increment)
- `stellar_address` (string, 56 chars, unique, not null)
- `public_key` (string, 56 chars, not null)
- `user_id` (integer, foreign key to users.id)
- `account_type` (string, 50 chars, default 'standard')
- `xlm_balance` (decimal 20,7, default 0)
- `sequence_number` (integer)
- `signers` (jsonb, default []) - Multi-signature signers
- `balances` (jsonb, default []) - All asset balances
- `thresholds` (jsonb) - Low, medium, high thresholds
- `flags` (jsonb) - Account flags
- `home_domain` (string, 255 chars)
- `subentry_count` (integer, default 0)
- `is_active` (boolean, default true)
- `last_synced_at` (timestamp)
- `created_at` (timestamp, default now)
- `updated_at` (timestamp, default now)

**Indexes:**
- `stellar_address` (unique index)
- `user_id` (index)
- `account_type` (index)
- `is_active` (index)
- `created_at` (index)

**Foreign Keys:**
- `user_id` → `users.id` (ON DELETE SET NULL)

**Migration:** `20260122000000_create_stellar_accounts.js`

---

### 3. stellar_transactions
Records all Stellar blockchain transactions.

**Columns:**
- `id` (integer, primary key, auto-increment)
- `transaction_hash` (string, 64 chars, unique, not null)
- `stellar_address` (string, 56 chars, not null)
- `source_account` (string, 56 chars, not null)
- `destination_account` (string, 56 chars)
- `transaction_type` (string, 50 chars, not null) - payment, create_account, etc.
- `asset_code` (string, 12 chars, default 'XLM')
- `asset_issuer` (string, 56 chars)
- `amount` (decimal 20,7, not null)
- `fee` (decimal 20,7, not null)
- `memo_type` (string, 20 chars)
- `memo` (text)
- `status` (string, 20 chars, default 'pending') - pending, success, failed
- `ledger_number` (integer)
- `ledger_close_time` (timestamp)
- `operation_details` (jsonb) - Full operation data
- `metadata` (jsonb) - Additional metadata
- `is_incoming` (boolean, default false)
- `created_at` (timestamp, default now)
- `updated_at` (timestamp, default now)

**Indexes:**
- `transaction_hash` (unique index)
- `stellar_address` (index)
- `source_account` (index)
- `destination_account` (index)
- `transaction_type` (index)
- `status` (index)
- `ledger_number` (index)
- `created_at` (index)
- `(stellar_address, created_at)` (composite index)
- `(status, created_at)` (composite index)

**Foreign Keys:**
- `stellar_address` → `stellar_accounts.stellar_address` (ON DELETE CASCADE)

**Migration:** `20260122000001_create_stellar_transactions.js`

---

### 4. webhooks
Webhook configurations for event notifications.

**Columns:**
- `id` (integer, primary key, auto-increment)
- `user_id` (integer, foreign key to users.id)
- `url` (string, 500 chars, not null) - Webhook endpoint URL
- `secret` (string, 255 chars, not null) - HMAC signature secret
- `events` (jsonb, not null) - Array of event types to listen for
- `status` (string, 20 chars, default 'active') - active, inactive, failed
- `retry_count` (integer, default 0)
- `max_retries` (integer, default 3)
- `last_triggered_at` (timestamp)
- `last_success_at` (timestamp)
- `last_failure_at` (timestamp)
- `last_error` (text)
- `headers` (jsonb) - Custom HTTP headers
- `metadata` (jsonb) - Additional configuration
- `is_active` (boolean, default true)
- `created_at` (timestamp, default now)
- `updated_at` (timestamp, default now)

**Indexes:**
- `user_id` (index)
- `status` (index)
- `is_active` (index)
- `(user_id, is_active)` (composite index)
- `created_at` (index)

**Foreign Keys:**
- `user_id` → `users.id` (ON DELETE CASCADE)

**Migration:** `20260122000002_create_webhooks.js`

---

### 5. webhook_events
Tracks webhook delivery attempts and status.

**Columns:**
- `id` (integer, primary key, auto-increment)
- `webhook_id` (integer, foreign key to webhooks.id, not null)
- `event_type` (string, 50 chars, not null)
- `payload` (jsonb, not null) - Event data
- `status` (string, 20 chars, default 'pending') - pending, success, failed
- `http_status_code` (integer)
- `response_body` (text)
- `error_message` (text)
- `attempt_count` (integer, default 0)
- `next_retry_at` (timestamp)
- `delivered_at` (timestamp)
- `created_at` (timestamp, default now)
- `updated_at` (timestamp, default now)

**Indexes:**
- `webhook_id` (index)
- `event_type` (index)
- `status` (index)
- `created_at` (index)
- `(webhook_id, status)` (composite index)
- `(status, next_retry_at)` (composite index)

**Foreign Keys:**
- `webhook_id` → `webhooks.id` (ON DELETE CASCADE)

**Migration:** `20260122000003_create_webhook_events.js`

---

## Running Migrations

### Apply all pending migrations:
```bash
npm run migrate
```

### Create a new migration:
```bash
npm run migrate:make migration_name
```

### Rollback last migration:
```bash
npm run migrate:rollback
```

### Rollback all migrations:
```bash
npm run migrate:rollback:all
```

### Check migration status:
```bash
npm run migrate:status
```

### Reset database (rollback all, migrate, seed):
```bash
npm run db:reset
```

## Models

All models are located in `backend/models/` and provide a clean API for database operations:

- **StellarTag** - Tag to address mapping operations
- **StellarAccount** - Account management and balance tracking
- **StellarTransaction** - Transaction history and queries
- **Webhook** - Webhook configuration management
- **WebhookEvent** - Webhook delivery tracking

### Example Usage:

```javascript
import { StellarTag, StellarAccount, StellarTransaction } from './models/index.js';

// Find tag
const tag = await StellarTag.findByTag('@alice');

// Get account
const account = await StellarAccount.findByAddress('GXXX...');

// Get transactions
const txs = await StellarTransaction.findByAddress('GXXX...', 50, 0);
```

## Performance Considerations

1. **Indexes**: All frequently queried columns have indexes for optimal performance
2. **Connection Pooling**: Configured with 2-10 connections to handle concurrent requests
3. **JSONB Fields**: Used for flexible schema storage with PostgreSQL's efficient JSONB type
4. **Composite Indexes**: Added for common query patterns (e.g., address + date)
5. **Cascade Deletes**: Proper foreign key constraints maintain referential integrity

## Security

1. **Webhook Secrets**: Store HMAC secrets for webhook signature verification
2. **Connection Pooling**: Prevents connection exhaustion attacks
3. **Input Validation**: Use Joi schemas before database operations
4. **Prepared Statements**: Knex automatically uses parameterized queries

## Maintenance

### Cleanup Old Webhook Events:
```javascript
import { WebhookEvent } from './models/index.js';
await WebhookEvent.deleteOld(30); // Delete events older than 30 days
```

### Monitor Connection Pool:
Check `knexfile.js` pool configuration if experiencing connection issues.
