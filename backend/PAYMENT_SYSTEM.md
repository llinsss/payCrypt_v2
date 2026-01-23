# Core Payment Processing System - Stellar Network

## Overview

This document describes the core payment processing system for @tag-to-@tag transfers on the Stellar network. The system provides secure, atomic transaction handling with comprehensive validation, error handling, and multi-signature support.

## Architecture

### Components

1. **PaymentService** (`services/PaymentService.js`)
   - Core payment orchestration and processing
   - Stellar network interaction
   - Transaction validation and creation
   - Balance checking with retry logic
   - Multi-signature account support

2. **TagService** (`services/TagService.js`)
   - @tag resolution to Stellar addresses
   - Tag management and validation

3. **Transaction Model** (`models/Transaction.js`)
   - Transaction record storage and retrieval
   - Transaction history queries

4. **Transaction Controller** (`controllers/transactionController.js`)
   - HTTP endpoint handlers
   - Request validation
   - Response formatting

5. **Payment Schemas** (`schemas/payment.js`)
   - Joi validation schemas
   - Request/response validation

## Payment Flow

### Step-by-Step Process

```
1. Validate Payment Parameters
   ├─ Check required fields
   ├─ Validate tag format (3-20 alphanumeric)
   ├─ Validate amount (min: 0.00001, max: 1,000,000 XLM)
   ├─ Validate asset code format
   └─ Validate memo length (max 28 chars)

2. Resolve @tags to Stellar Addresses
   ├─ Query stellar_tags table
   ├─ Verify both addresses exist
   └─ Ensure sender ≠ recipient

3. Get Token Information
   ├─ Query tokens table
   └─ Retrieve current price for USD conversion

4. Check Sender Balance
   ├─ Load account from Stellar network
   ├─ Calculate total cost (amount + fee)
   ├─ Verify sufficient balance
   └─ Retry on network errors (max 3 attempts)

5. Verify Recipient Account
   ├─ Load recipient account from network
   └─ Ensure account exists

6. Create Transaction Record (Pending)
   ├─ Generate unique reference ID
   ├─ Store in database with pending status
   └─ Begin database transaction

7. Create Stellar Transaction
   ├─ Load sender account sequence number
   ├─ Check multi-signature requirements
   ├─ Build payment operation
   ├─ Add memo if provided
   └─ Sign with all provided secret keys

8. Submit to Stellar Network
   ├─ Submit signed transaction
   ├─ Retry on network errors (exponential backoff)
   └─ Retrieve transaction hash

9. Update Transaction Record
   ├─ Set status to completed
   ├─ Store transaction hash
   ├─ Record timestamp
   └─ Commit database transaction

10. Return Success Response
    └─ Include transaction ID, hash, and details
```

## API Endpoints

### Process Payment

**POST** `/api/transactions/payment`

Requires authentication. Processes a @tag-to-@tag payment on Stellar network.

#### Request Body

```json
{
  "senderTag": "alice",
  "recipientTag": "bob",
  "amount": 100.5,
  "asset": "XLM",
  "assetIssuer": null,
  "memo": "Payment for services",
  "senderSecret": "SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "additionalSecrets": []
}
```

#### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| senderTag | string | Yes | Sender @tag (3-20 alphanumeric) |
| recipientTag | string | Yes | Recipient @tag (3-20 alphanumeric) |
| amount | number | Yes | Amount to send (0.00001 - 1,000,000) |
| asset | string | No | Asset code (default: 'XLM') |
| assetIssuer | string | No | Stellar address of asset issuer (required for custom assets) |
| memo | string | No | Payment memo (max 28 characters) |
| senderSecret | string | Yes | Sender's Stellar secret key |
| additionalSecrets | array | No | Additional secret keys for multi-signature |

#### Response (Success)

```json
{
  "success": true,
  "message": "Payment processed successfully",
  "data": {
    "transactionId": 12345,
    "txHash": "abc123def456...",
    "ledger": 47291847,
    "amount": 100.5,
    "fee": 0.10050,
    "asset": "XLM",
    "senderTag": "alice",
    "recipientTag": "bob",
    "timestamp": "2024-01-23T10:30:45Z"
  }
}
```

#### Response (Error)

```json
{
  "success": false,
  "error": "Insufficient funds. Balance: 50 XLM, required: 100.60050 XLM"
}
```

#### Status Codes

- `201` - Payment processed successfully
- `400` - Validation error or payment failed
- `402` - Insufficient funds
- `403` - Unauthorized
- `404` - Tag not found
- `503` - Network error (Stellar network unavailable)

### Get Payment Limits

**GET** `/api/transactions/payment/limits`

Retrieves payment limits and configuration.

#### Response

```json
{
  "success": true,
  "data": {
    "maxAmount": 1000000,
    "minAmount": 0.00001,
    "baseFeePercentage": 0.1,
    "minFee": 0.00001
  }
}
```

### Get Payment History

**GET** `/api/transactions/tag/:tag/history`

Retrieves transaction history for a @tag.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| limit | number | 20 | Results per page (1-100) |
| offset | number | 0 | Pagination offset |
| from | string | null | Start date (ISO 8601) |
| to | string | null | End date (ISO 8601) |
| type | string | null | Filter by type (payment, credit, debit) |
| sortBy | string | created_at | Sort field |
| sortOrder | string | desc | Sort order (asc, desc) |

#### Response

```json
{
  "success": true,
  "data": [
    {
      "id": 12345,
      "user_tag": "alice",
      "type": "payment",
      "status": "completed",
      "amount": 100.5,
      "usd_value": 2010.5,
      "from_address": "GXXXXXXX...",
      "to_address": "GYYYYYYY...",
      "tx_hash": "abc123def456...",
      "description": "Payment for services",
      "created_at": "2024-01-23T10:30:45Z"
    }
  ],
  "count": 1
}
```

## Fee Calculation

The system calculates fees as follows:

```
baseFee = max(amount * 0.1%, 0.00001 XLM)
networkFee = 0.00001 XLM (Stellar base fee)
totalFee = baseFee + networkFee
```

### Example

For a 100 XLM payment:
- Base fee: 100 × 0.001 = 0.1 XLM
- Network fee: 0.00001 XLM
- Total fee: 0.10001 XLM
- Total cost: 100.10001 XLM

## Validation Rules

### Tag Format
- Length: 3-20 characters
- Characters: alphanumeric + underscore
- Case-insensitive (stored lowercase)
- Pattern: `/^[a-zA-Z0-9_]{3,20}$/`

### Amount
- Minimum: 0.00001 XLM
- Maximum: 1,000,000 XLM
- Precision: 7 decimal places

### Asset Code
- Length: 1-12 characters
- Characters: uppercase alphanumeric
- Pattern: `/^[A-Z0-9]{1,12}$/`

### Stellar Address
- Format: Public key starting with 'G' followed by 55 alphanumeric characters
- Pattern: `/^G[A-Z0-9]{55}$/`

### Secret Key
- Format: Secret key starting with 'S' followed by 55 alphanumeric characters
- Pattern: `/^S[A-Z0-9]{55}$/`

### Memo
- Maximum length: 28 characters
- Type: Text memo

## Error Handling

### Network Errors

The system implements exponential backoff retry logic for network errors:

```
Retry Attempts: 3
Initial Delay: 1000ms
Backoff: exponential (2^n)
Max Delay: 10000ms
Jitter: ±1000ms
```

Network errors include:
- Connection timeouts
- DNS resolution failures
- Connection resets
- Socket errors

### Validation Errors

Validation errors return `400` status with detailed error messages:

```json
{
  "error": "Validation failed",
  "details": [
    {
      "field": "amount",
      "message": "Amount must be greater than 0"
    }
  ]
}
```

### Business Logic Errors

- **Insufficient Funds** (402): Balance < total cost
- **Tag Not Found** (404): Sender or recipient tag doesn't exist
- **Account Not Found** (404): Recipient account doesn't exist on Stellar
- **Invalid Secret Key** (400): Secret key format invalid
- **Multi-Signature Required** (400): Not enough signatures provided

## Multi-Signature Support

The system supports multi-signature accounts:

1. **Detection**: Automatically detects if account requires multi-signature
2. **Validation**: Ensures sufficient signatures are provided
3. **Signing**: Signs transaction with all provided secret keys
4. **Verification**: Validates no duplicate secret keys

### Example: Multi-Signature Payment

```json
{
  "senderTag": "alice",
  "recipientTag": "bob",
  "amount": 100,
  "senderSecret": "SXXXXXXX...",
  "additionalSecrets": [
    "SYYYYYYY...",
    "SZZZZZZ..."
  ]
}
```

## Transaction Storage

### Database Schema

```sql
CREATE TABLE transactions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  token_id INT NOT NULL,
  chain_id INT NOT NULL,
  reference VARCHAR(255) UNIQUE,
  type VARCHAR(255),
  status VARCHAR(255),
  amount DECIMAL(18, 10),
  usd_value DECIMAL(18, 10),
  from_address VARCHAR(255),
  to_address VARCHAR(255),
  tx_hash VARCHAR(255),
  description TEXT,
  extra JSON,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX (user_id),
  INDEX (tx_hash)
);
```

### Transaction States

- **pending**: Transaction created, awaiting network submission
- **completed**: Transaction successfully submitted to network
- **failed**: Transaction submission failed

### Extra Field

Stores additional transaction metadata as JSON:

```json
{
  "fee": 0.10001,
  "baseFee": 0.1,
  "networkFee": 0.00001,
  "asset": "XLM",
  "assetIssuer": null,
  "senderTag": "alice",
  "recipientTag": "bob"
}
```

## Security Considerations

### Secret Key Handling

1. **Never Log**: Secret keys are never logged or stored in plain text
2. **HTTPS Only**: All endpoints require HTTPS in production
3. **Authentication**: All payment endpoints require JWT authentication
4. **Validation**: Secret keys are validated before use

### Transaction Atomicity

1. **Database Transaction**: All database operations are atomic
2. **Rollback**: Failed submissions rollback database changes
3. **Idempotency**: Transaction reference prevents duplicate submissions

### Rate Limiting

- Global rate limit: 100 requests per minute per IP
- Payment endpoint: Recommended 10 requests per minute per user

## Testing

### Unit Tests

```bash
npm test -- test/services/payment_service_test.dart
```

### Integration Tests

```bash
npm test -- test/services/payment_service_test.dart
```

### Manual Testing

```bash
# Process payment
curl -X POST http://localhost:3000/api/transactions/payment \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "senderTag": "alice",
    "recipientTag": "bob",
    "amount": 100,
    "senderSecret": "SXXXXXXX..."
  }'

# Get payment limits
curl http://localhost:3000/api/transactions/payment/limits

# Get payment history
curl http://localhost:3000/api/transactions/tag/alice/history
```

## Configuration

### Environment Variables

```env
# Stellar Network
STELLAR_NETWORK=PUBLIC  # PUBLIC or TESTNET
STELLAR_HORIZON_URL=https://horizon.stellar.org

# Payment Limits
PAYMENT_MAX_AMOUNT=1000000
PAYMENT_MIN_AMOUNT=0.00001
PAYMENT_BASE_FEE_PERCENTAGE=0.001
PAYMENT_MIN_FEE=0.00001

# Retry Configuration
PAYMENT_MAX_RETRIES=3
PAYMENT_RETRY_DELAY_MS=1000
PAYMENT_NETWORK_TIMEOUT=30
```

### Payment Configuration

Edit `PAYMENT_CONFIG` in `PaymentService.js`:

```javascript
const PAYMENT_CONFIG = {
  MAX_AMOUNT: 1000000,
  MIN_AMOUNT: 0.00001,
  BASE_FEE_PERCENTAGE: 0.001,
  MIN_FEE: 0.00001,
  NETWORK_TIMEOUT: 30,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  ACCOUNT_RESERVE: 2
};
```

## Monitoring and Logging

### Log Levels

- **INFO**: Payment processing steps
- **WARN**: Retry attempts, network errors
- **ERROR**: Payment failures, validation errors

### Key Metrics

- Payment success rate
- Average processing time
- Network error frequency
- Fee statistics

## Future Enhancements

1. **Batch Payments**: Process multiple payments in single transaction
2. **Payment Scheduling**: Schedule payments for future dates
3. **Recurring Payments**: Set up recurring payment schedules
4. **Payment Webhooks**: Notify external systems of payment status
5. **Advanced Analytics**: Detailed payment analytics and reporting
6. **Custom Fee Structures**: Configurable fee models per user/tier
7. **Payment Reversals**: Support for payment reversals/refunds
8. **Cross-Chain Payments**: Support for payments across multiple chains

## Troubleshooting

### Common Issues

**"Insufficient funds"**
- Check account balance on Stellar network
- Verify fee calculation
- Ensure account has minimum reserve

**"Tag not found"**
- Verify tag exists in stellar_tags table
- Check tag spelling and case
- Ensure tag is registered

**"Network error"**
- Check Stellar network status
- Verify internet connectivity
- Check Horizon server availability

**"Invalid secret key"**
- Verify secret key format (starts with 'S')
- Ensure key is 56 characters long
- Check for typos or corruption

## Support

For issues or questions:
1. Check logs for detailed error messages
2. Review validation schemas for format requirements
3. Verify Stellar network status
4. Contact development team with transaction ID and error details
