# PayCrypt Payment Processing System - Stellar Integration

## Overview

This document describes the implementation of the core payment processing system for @tag-to-@tag transfers on the Stellar network. The system handles transaction processing, validation, fee calculation, and atomic transactions.

## Architecture

### Components

1. **PaymentService** (`services/PaymentService.js`)
   - Core payment processing logic
   - @tag resolution
   - Payment validation and limits
   - Fee calculation
   - Balance management
   - Transaction history

2. **PaymentController** (`controllers/paymentController.js`)
   - HTTP request handling
   - Input validation
   - Response formatting
   - Error handling

3. **Payment Routes** (`routes/payments.js`)
   - Endpoint definitions
   - Authentication middleware integration

4. **Stellar Worker** (`workers/stellar.js`)
   - Async transaction submission
   - Stellar SDK integration
   - Transaction status tracking
   - Retry logic

5. **Payment Schemas** (`schemas/payment.js`)
   - Request validation schemas
   - Joi validation rules

## API Endpoints

### 1. Initiate Payment
```
POST /api/payments/initiate
Authentication: Required
Content-Type: application/json

Request Body:
{
  "recipientTag": "@john",      // or "john" (with or without @)
  "amount": 50.00,              // USD amount
  "asset": "xlm",               // "xlm", "usdc", "bnx", "usdt" (optional, default: xlm)
  "memo": "Payment for lunch"   // Max 28 characters (optional)
}

Response (201):
{
  "status": "success",
  "message": "Payment initiated successfully",
  "data": {
    "id": 123,
    "reference": "PAY-1705958401234-abc123def",
    "status": "pending",
    "sender": {
      "id": 1,
      "tag": "myuser",
      "address": "GBXXX..."
    },
    "recipient": {
      "id": 2,
      "tag": "john",
      "address": "GBYYY..."
    },
    "amount": "50.0000000",
    "usd_value": "50.00",
    "asset": "xlm",
    "fees": {
      "percentageRate": 0.01,
      "percentageAmount": "0.50",
      "fixedMinimum": 0.01,
      "fixedMaximum": 100,
      "totalFee": "0.50",
      "netAmount": "49.50"
    },
    "memo": "Payment for lunch",
    "created_at": "2024-01-22T10:30:00Z",
    "message": "Payment submitted to Stellar network. Awaiting confirmation."
  }
}

Error Responses:
- 400: Invalid input, insufficient balance, limit exceeded
- 404: Tag not found
- 500: Server error
```

### 2. Verify Payment (Dry-Run)
```
POST /api/payments/verify
Authentication: Required
Content-Type: application/json

Request Body:
{
  "recipientTag": "@john",
  "amount": 50.00,
  "asset": "xlm",
  "memo": "Payment for lunch"
}

Response (200):
{
  "status": "success",
  "message": "Payment verification successful",
  "data": {
    "valid": true,
    "sender": {
      "id": 1,
      "tag": "myuser",
      "email": "user@example.com"
    },
    "recipient": {
      "id": 2,
      "tag": "john",
      "email": "john@example.com"
    },
    "payment": {
      "amount": 50.00,
      "asset": "xlm",
      "memo": "Payment for lunch"
    },
    "fees": {
      "percentageRate": 0.01,
      "percentageAmount": "0.50",
      "fixedMinimum": 0.01,
      "fixedMaximum": 100,
      "totalFee": "0.50",
      "netAmount": "49.50"
    },
    "total": "50.50",
    "estimatedTime": "2-5 minutes"
  }
}
```

### 3. Get Payment Status
```
GET /api/payments/transaction/PAY-1705958401234-abc123def
Authentication: Required

Response (200):
{
  "status": "success",
  "data": {
    "id": 123,
    "reference": "PAY-1705958401234-abc123def",
    "user_id": 1,
    "type": "debit",
    "status": "completed",
    "amount": "50.0000000",
    "usd_value": "50.00",
    "tx_hash": "stellar_transaction_hash_here",
    "from_address": "GBXXX...",
    "to_address": "GBYYY...",
    "description": "Payment to @john - Payment for lunch",
    "extra": {
      "recipientTag": "john",
      "fees": {...},
      "stellar_hash": "...",
      "submitted_at": "2024-01-22T10:30:00Z",
      "confirmed_at": "2024-01-22T10:32:00Z"
    },
    "created_at": "2024-01-22T10:30:00Z"
  }
}
```

### 4. Get Transaction History
```
GET /api/payments/history?limit=20&offset=0&type=debit&status=completed
Authentication: Required
Query Parameters:
  - limit: 1-100 (default: 20)
  - offset: >= 0 (default: 0)
  - type: "credit" | "debit" | "payment" | "payment_received" (optional)
  - status: "pending" | "completed" | "failed" | "cancelled" (optional)

Response (200):
{
  "status": "success",
  "data": [
    {
      "id": 123,
      "reference": "PAY-...",
      "type": "debit",
      "status": "completed",
      "amount": "50.0000000",
      "usd_value": "50.00",
      "from_address": "GBXXX...",
      "to_address": "GBYYY...",
      "description": "Payment to @john",
      "created_at": "2024-01-22T10:30:00Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "count": 1
  }
}
```

### 5. Calculate Fees
```
GET /api/payments/calculator?amount=100&asset=xlm
Query Parameters:
  - amount: Numeric amount in USD (required)
  - asset: "xlm" | "usdc" | "bnx" | "usdt" (optional, default: xlm)

Response (200):
{
  "status": "success",
  "data": {
    "amount": 100.00,
    "asset": "xlm",
    "percentageRate": 0.01,
    "percentageAmount": "1.00",
    "fixedMinimum": 0.01,
    "fixedMaximum": 100,
    "totalFee": "1.00",
    "netAmount": "99.00"
  }
}
```

### 6. Resolve Tag
```
POST /api/payments/resolve-tag
Content-Type: application/json

Request Body:
{
  "tag": "@john"  // or "john" (with or without @)
}

Response (200):
{
  "status": "success",
  "data": {
    "tag": "john",
    "email": "john@example.com",
    "stellarAddress": "GBYYY...",
    "exists": true
  }
}

Response (404):
{
  "status": "error",
  "message": "Tag @john not found",
  "data": {
    "exists": false
  }
}
```

### 7. Get Payment Limits
```
GET /api/payments/limits
Authentication: Required

Response (200):
{
  "status": "success",
  "data": {
    "limits": {
      "minAmount": 1,
      "maxAmount": 100000,
      "dailyLimit": 1000000,
      "maxTransactionsPerDay": 1000
    },
    "usage": {
      "dailySpent": "450.50",
      "dailyRemaining": "999549.50",
      "dailyTransactions": 3,
      "remainingTransactions": 997
    }
  }
}
```

## Payment Flow

### Sequence Diagram

```
User A                    API                  Database              Stellar Network
   |                      |                       |                        |
   |--initiatePayment---->|                       |                        |
   |                      |--validatePayment---->|                         |
   |                      |<-----validation--------|                        |
   |                      |--calculateFees------->|                         |
   |                      |<-----fees-------|                        |
   |                      |--createTransaction-->|                         |
   |                      |<--transaction record--|                         |
   |                      |--deductBalance------>|                         |
   |                      |<---updated balance----|                         |
   |                      |--creditBalance------>|                         |
   |                      |<---updated balance----|                         |
   |                      |--queueStellarTx----->|                         |
   |                      |<---queued for worker--|                         |
   |                      |--return pending---->|                         |
   |<--reference--(pending)-|                       |                        |
   |                      |                       |--submitTransaction--->|
   |                      |                       |<---confirmation-------|
   |                      |--updateTxStatus----->|                         |
   |                      |<--status: completed---|                         |
```

### Transaction Processing States

1. **Pending**: Payment initiated, awaiting Stellar submission
2. **Completed**: Successfully submitted to Stellar network
3. **Failed**: Payment failed after max retries
4. **Cancelled**: User-initiated cancellation

## Payment Validation

### Pre-Payment Checks

1. **Amount Validation**
   - Must be positive number
   - Minimum: $1
   - Maximum: $100,000

2. **Tag Resolution**
   - Resolve recipient @tag
   - Verify recipient account exists
   - Prevent self-payment

3. **Balance Check**
   - Sender has sufficient USD value
   - Include fee amount in calculation

4. **Daily Limits**
   - Daily limit: $1,000,000
   - Daily transaction limit: 1,000 transactions
   - Check remaining capacity

5. **Memo Validation**
   - Maximum 28 characters
   - Must be text format

## Fee Structure

```
Calculation Logic:
1. percentageAmount = amount × 1%
2. totalFee = MAX(percentageAmount, $0.01)
3. totalFee = MIN(totalFee, $100.00)
4. netAmount = amount - totalFee
5. sender pays = amount + totalFee
6. recipient receives = netAmount

Examples:
- $50 payment: 1% = $0.50, total fee = $0.50, recipient gets $49.50
- $0.50 payment: 1% = $0.005, min $0.01 applied, recipient gets $0.49
- $1M payment: 1% = $10k, max $100 applied, recipient gets $999,900
```

## Error Handling

### Validation Errors (400)
- Invalid amount
- Tag not found
- Insufficient balance
- Daily limit exceeded
- Invalid memo

### Authorization Errors (403)
- Cannot send to self
- User not authenticated
- Unauthorized to view transaction

### Not Found Errors (404)
- Recipient tag not found
- Transaction reference not found

### Server Errors (500)
- Database errors
- Stellar network errors
- Configuration errors

## Transaction Record Structure

### Debit Transaction (Sender)
```javascript
{
  id: 123,
  user_id: 1,                    // Sender ID
  token_id: 1,                   // XLM token ID
  chain_id: 1,                   // Stellar chain ID
  reference: "PAY-...",          // Unique payment reference
  type: "debit",                 // Money going out
  action: "payment",             // Action type
  amount: "50.0000000",          // Amount with 7 decimals
  usd_value: "50.00",            // USD value
  from_address: "GBXXX...",      // Sender Stellar address
  to_address: "GBYYY...",        // Recipient Stellar address
  description: "Payment to @john - Payment for lunch",
  status: "pending",             // pending, completed, failed
  tx_hash: null,                 // Stellar transaction hash
  extra: {                       // JSON metadata
    recipientTag: "john",
    recipientId: 2,
    fees: {...},
    asset: "xlm",
    memo: "Payment for lunch",
    processed_at: "2024-01-22T10:30:00Z"
  },
  created_at: "2024-01-22T10:30:00Z"
}
```

### Credit Transaction (Recipient)
```javascript
{
  id: 124,
  user_id: 2,                    // Recipient ID
  token_id: 1,
  chain_id: 1,
  reference: "PAY-...",          // Same as debit transaction
  type: "credit",                // Money coming in
  action: "payment_received",    // Action type
  amount: "50.0000000",
  usd_value: "49.50",            // Net amount (after fees)
  from_address: "GBXXX...",      // Sender Stellar address
  to_address: "GBYYY...",        // Recipient Stellar address
  description: "Payment from @myuser - Payment for lunch",
  status: "pending",
  tx_hash: null,
  extra: {
    senderTag: "myuser",
    senderId: 1,
    fees: {...},
    asset: "xlm",
    memo: "Payment for lunch",
    processed_at: "2024-01-22T10:30:00Z"
  },
  created_at: "2024-01-22T10:30:00Z"
}
```

## Stellar Worker Processing

### Worker Lifecycle

```javascript
// Start worker
import stellarWorker from "./workers/stellar.js";
await stellarWorker.start();

// Worker polls every 5 seconds for pending transactions
// Processes each transaction:
// 1. Retrieve from database
// 2. Build Stellar transaction
// 3. Sign with sender keypair
// 4. Submit to network
// 5. Update database with hash
// 6. Remove from pending queue

// Stop worker
await stellarWorker.stop();
```

### Retry Logic

- Max retries: 5
- Initial failure: Marked for retry
- After 5 retries: Marked as failed
- Failed transactions logged with error message

### Transaction Signing (IMPORTANT SECURITY NOTE)

⚠️ **IMPORTANT**: The current implementation includes a reference to sender keypair signing, but this should NOT be used in production. Instead, implement one of the following:

1. **Hardware Security Module (HSM)**
   - Secure key storage
   - Offline signing capability

2. **Key Management Service (KMS)**
   - AWS KMS
   - Google Cloud KMS
   - Azure Key Vault

3. **Multi-Signature Accounts**
   - Distribute signing authority
   - Require multiple approvals

4. **Custodial Wallet Service**
   - Third-party wallet provider
   - Professional key management

**DO NOT** store private keys in environment variables or code.

## Data Models

### Required Database Schema

The implementation uses existing tables:
- `users` - User accounts with @tag
- `transactions` - Transaction records
- `balances` - User balance tracking
- `tokens` - Cryptocurrency tokens (must include XLM)
- `chains` - Blockchain networks (must include Stellar)
- `stellar_tags` - @tag to Stellar address mappings (existing)

### Migration Note

If you need to add additional columns to transactions table:

```sql
-- Example additions (if needed)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(256);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS action VARCHAR(50);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS extra JSONB;
```

## Configuration

### Environment Variables Required

```bash
# Stellar Network Configuration
STELLAR_NETWORK=testnet                    # testnet or public
STELLAR_RPC_URL=https://horizon-testnet.stellar.org
STELLAR_ACCOUNT_SECRET=S...                # Master account secret (see security note above)

# For custom assets (if used)
STELLAR_USDC_ISSUER=GA...
STELLAR_USDT_ISSUER=GA...
STELLAR_BNX_ISSUER=GA...

# Database (existing)
DATABASE_URL=postgresql://...

# Redis (existing)
REDIS_URL=redis://...
```

## Testing

### Manual API Testing with cURL

```bash
# 1. Verify tag exists
curl -X POST http://localhost:3000/api/payments/resolve-tag \
  -H "Content-Type: application/json" \
  -d '{"tag": "@john"}'

# 2. Check payment limits
curl -X GET http://localhost:3000/api/payments/limits \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Calculate fees
curl -X GET "http://localhost:3000/api/payments/calculator?amount=100&asset=xlm"

# 4. Verify payment before sending
curl -X POST http://localhost:3000/api/payments/verify \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientTag": "@john",
    "amount": 50,
    "asset": "xlm",
    "memo": "Test payment"
  }'

# 5. Initiate payment
curl -X POST http://localhost:3000/api/payments/initiate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "recipientTag": "@john",
    "amount": 50,
    "asset": "xlm",
    "memo": "Test payment"
  }'

# 6. Check payment status
curl -X GET http://localhost:3000/api/payments/transaction/PAY-1705958401234-abc123def \
  -H "Authorization: Bearer YOUR_TOKEN"

# 7. Get transaction history
curl -X GET "http://localhost:3000/api/payments/history?limit=10&type=debit" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Integration Notes

### Existing System Integration

This payment system integrates with:
- **Authentication**: Uses existing JWT middleware
- **User Model**: Uses existing User.findByTag()
- **Transactions**: Extends existing transaction table
- **Balances**: Works with existing balance tracking
- **Tags**: Uses existing stellar_tags table

### Additional Setup Required

1. **Install Stellar SDK** (if not already installed):
   ```bash
   cd backend
   npm install stellar
   ```

2. **Register payment routes** (already done):
   - Routes imported in `/routes/index.js`
   - Accessible at `/api/payments/*`

3. **Start Stellar worker** (add to server initialization):
   ```javascript
   import stellarWorker from "./workers/stellar.js";
   await stellarWorker.start();
   ```

## Performance Considerations

- **Redis Caching**: User limits cached per minute
- **Batch Processing**: Worker processes up to N transactions per cycle
- **Connection Pooling**: Database connections pooled via Knex
- **Async Processing**: Stellar submissions handled asynchronously

## Security Considerations

1. **Input Validation**: All inputs validated with Joi schemas
2. **SQL Injection Prevention**: Parameterized queries via Knex
3. **XSS Prevention**: Existing helmet and sanitization middleware
4. **CSRF Protection**: Stateless JWT authentication
5. **Rate Limiting**: Implement with existing rate limit middleware:
   ```javascript
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 100 // requests per window
   });
   router.post("/initiate", limiter, authenticate, initiatePayment);
   ```
6. **Key Management**: ⚠️ Use HSM/KMS for production (see warning above)

## Support & Maintenance

### Monitoring

Monitor these Redis keys:
```
stellar:pending:*  - Pending Stellar transactions
```

### Common Issues

1. **"Tag not found"**
   - Verify tag exists in database
   - Check stellar_tags table

2. **"Insufficient balance"**
   - Check user balance includes fees
   - Verify token_id matches

3. **"Stellar submission failed"**
   - Check network connectivity
   - Verify Stellar account has minimum balance
   - Check transaction fee settings

4. **Transaction stuck in pending**
   - Check Stellar worker is running
   - Check Redis connectivity
   - Review worker logs for errors

## Future Enhancements

- [ ] Multi-signature support (3/5 threshold)
- [ ] Scheduled payments
- [ ] Payment batch processing
- [ ] Advanced fee structures (tier-based)
- [ ] Transaction expiration
- [ ] Chargeback handling
- [ ] Payment webhooks
- [ ] Advanced analytics
