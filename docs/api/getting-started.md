# Getting Started — Tagg@d API

This guide walks you through a complete payment flow using the Tagg@d API, from registration to sending a payment. All examples use realistic data and `curl` commands you can run against the live or test server.

## Base URL

| Environment | Base URL |
|-------------|----------|
| Production  | `https://taggedpay.xyz/api/v2` |
| Development | `http://localhost:5002/api/v2` |
| Legacy (deprecated) | `https://taggedpay.xyz/api/v1` |

## Authentication

### JWT Bearer Token

Most API endpoints require a **JWT Bearer token** in the `Authorization` header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

1. Register a user via `POST /api/auth/register`
2. Log in via `POST /api/auth/login` — the response includes a `token` field
3. Include the token in subsequent requests

### API Key (for third-party integrations)

For server-to-server integrations, use an **API key** instead of JWT:

```
x-api-key: tagged_live_sk_a1b2c3d4e5f6...
```

1. Create an API key via `POST /api/api-keys` (requires JWT auth first)
2. Specify scopes (e.g., `transactions:read,webhooks:read`)
3. Include the key in the `x-api-key` header

API keys support scope-based authorization. Available scopes:

| Scope | Description |
|-------|-------------|
| `transactions:read` | Read transaction history |
| `transactions:write` | Create, update, delete transactions |
| `payments:send` | Send payments and batch payments |
| `webhooks:read` | List and retrieve webhook configurations |
| `webhooks:write` | Create, update, delete webhooks |

## Step-by-Step Walkthrough

### Step 1: Register a New User

```bash
curl -X POST https://taggedpay.xyz/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john.lagos@example.com",
    "password": "StrongP@ssw0rd!",
    "firstName": "John",
    "lastName": "Adebayo"
  }'
```

**Response (201):**
```json
{
  "status": "success",
  "data": {
    "id": "usr_abc123",
    "email": "john.lagos@example.com",
    "firstName": "John",
    "lastName": "Adebayo",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3JfYWJjMTIzIn0..."
  }
}
```

> **Important:** Save the `token` — you'll need it for all subsequent requests.

### Step 2: Register Your @Tag

Every Tagg@d user needs a unique @tag (like a username) that replaces long wallet addresses:

```bash
curl -X POST https://taggedpay.xyz/api/tags \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "john_lagos",
    "userId": "usr_abc123"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "tag": "john_lagos",
    "walletAddress": "0x1234567890abcdef1234567890abcdef12345678",
    "chain": "base"
  }
}
```

### Step 3: Submit KYC (Know Your Customer)

KYC verification is required for withdrawals and higher transaction limits:

```bash
curl -X POST https://taggedpay.xyz/api/kycs \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "idType": "passport",
    "idNumber": "A12345678",
    "idImage": "https://cdn.example.com/john_passport.jpg",
    "selfieImage": "https://cdn.example.com/john_selfie.jpg",
    "addressProof": "https://cdn.example.com/john_utility_bill.pdf",
    "country": "NG",
    "dateOfBirth": "1990-05-15"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "pending",
    "message": "KYC submitted. Verification typically takes 24-48 hours."
  }
}
```

### Step 4: Create a Wallet Balance

Add a balance record for a specific chain and token:

```bash
curl -X POST https://taggedpay.xyz/api/balances \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "chain": "stellar",
    "token": "USDC",
    "address": "GABCDXYZ1234567890ABCDEF1234567890ABCDEF1234567890"
  }'
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": 42,
    "chain": "stellar",
    "token": "USDC",
    "address": "GABCDXYZ1234567890...",
    "balance": 0.00,
    "usd_value": 0.00
  }
}
```

### Step 5: Check Your Balance Summary

View your cross-chain portfolio:

```bash
curl -X GET https://taggedpay.xyz/api/balances/summary \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_usd": 2500.00,
    "total_ngn": 3875000.00,
    "balances": [
      { "chain": "stellar", "token": "USDC", "balance": 500.00, "usd_value": 500.00 },
      { "chain": "base", "token": "ETH", "balance": 1.0, "usd_value": 2000.00 },
      { "chain": "stellar", "token": "XLM", "balance": 5000.00, "usd_value": 500.00 }
    ]
  }
}
```

### Step 6: Send a Payment to Another @Tag

The core feature of Tagg@d — send crypto using just a @tag instead of a wallet address:

```bash
curl -X POST https://taggedpay.xyz/api/transactions/payment \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "senderTag": "john_lagos",
    "recipientTag": "alice",
    "amount": 50.0,
    "asset": "USDC",
    "memo": "Monthly rent payment",
    "idempotencyKey": "pay_john_alice_2025_01"
  }'
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "transaction_id": 42,
    "tx_hash": "abc123def456...",
    "status": "completed",
    "sender_tag": "john_lagos",
    "receiver_tag": "alice",
    "amount": 50.0,
    "asset": "USDC",
    "fee": 0.25,
    "net_amount": 49.75,
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

### Step 7: Send to an External Wallet Address

For withdrawing to an external blockchain address, use the wallet endpoint (requires 2FA):

```bash
curl -X POST https://taggedpay.xyz/api/wallets/send-to-wallet \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "receiver_address": "0x9876543210abcdef9876543210abcdef98765432",
    "amount": 0.5,
    "balance_id": 42
  }'
```

### Step 8: Withdraw to a Nigerian Bank Account

1. Link a bank account (if not already done):

```bash
# (Bank account is typically created during onboarding or via the frontend)
```

2. Initiate a withdrawal:

```bash
curl -X POST https://taggedpay.xyz/api/withdrawals/initiate \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 50000,
    "bankAccountId": 1
  }'
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": 15,
    "reference": "WD_ref_abc123",
    "status": "pending",
    "amount": 50000,
    "fee": 250,
    "net_amount": 49750,
    "provider": "paystack"
  }
}
```

## Webhook Integration

To receive real-time notifications about payment events:

### 1. Register a webhook

```bash
curl -X POST https://taggedpay.xyz/api/webhooks \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourapp.com/api/webhooks/tagged",
    "events": ["payment.completed", "payment.failed", "wallet.credited"],
    "secret": "whsec_your_custom_secret_here"
  }'
```

### 2. Available webhook events

| Event | Trigger |
|-------|---------|
| `payment.completed` | A payment has been successfully processed |
| `payment.failed` | A payment has failed |
| `payment.pending` | A payment is awaiting processing |
| `payment.refunded` | A payment has been refunded |
| `wallet.credited` | Funds have been credited to a wallet |
| `wallet.debited` | Funds have been debited from a wallet |
| `kyc.approved` | KYC verification has been approved |
| `kyc.rejected` | KYC verification has been rejected |
| `transaction.status_changed` | A transaction's status has changed |

### 3. Webhook payload structure

Each webhook delivery includes a payload with the following structure:

```json
{
  "event": "payment.completed",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "transaction_id": 42,
    "user_id": "usr_abc123",
    "amount": 50.0,
    "asset": "USDC",
    "status": "completed",
    "sender_tag": "john_lagos",
    "receiver_tag": "alice"
  },
  "signature": "sha256=abc123def456..."
}
```

### 4. Verify webhook signatures

Every webhook delivery includes an HMAC-SHA256 signature in the `X-Tagged-Signature` header. Verify it using your webhook secret:

```javascript
const crypto = require('crypto');
const signature = req.headers['x-tagged-signature'];
const payload = JSON.stringify(req.body);
const expected = crypto.createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex');
if (signature !== `sha256=${expected}`) {
  // Reject — invalid signature
}
```

## Error Handling

All errors follow a consistent format:

```json
{
  "error": "Description of the error",
  "required_scopes": ["transactions:write"]  // if scope-related
}
```

Common HTTP status codes:

| Code | Meaning |
|------|---------|
| 400 | Validation error or bad request |
| 401 | Missing or invalid authentication |
| 403 | Forbidden — insufficient permissions |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

## Rate Limits

| Endpoint | Window | Max Requests |
|----------|--------|-------------|
| Global API | 1 hour | 1000 |
| Login | 15 min | 5 |
| Register | 1 hour | 5 |
| Payment | 1 min | 10 |
| Balance queries | 1 hour | 1000 |
| Bill payment | 1 min | 5 |
| Transaction search | 1 min | 30 |
| Export | 1 hour | 5 |
| API key creation | 1 min | 2 |

## API Versioning

The API supports versioned endpoints:

- `GET /api/versions` — List available versions and deprecation status
- `/api/v2` — Current version
- `/api/v1` — Deprecated (will sunset)
- `/api` — Unversioned alias (mirrors current version)

## Next Steps

- **Explore the full API reference:** Visit the [API docs site](./index.html) or fetch the OpenAPI spec at `GET /api/docs-json`
- **Import the Postman collection:** Download `docs/Tagged_API.postman_collection.json` and import into Postman
- **Set up webhooks:** Register webhook subscriptions to receive real-time event notifications
- **Create API keys:** Generate scoped API keys for server-to-server integrations
