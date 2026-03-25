# Batch Payment API Documentation

## Overview

The Batch Payment API enables processing multiple payments in a single request, ideal for payroll, airdrops, and bulk transfers.

## Base URL

```
http://localhost:3000
```

## Authentication

Currently uses mock authentication. In production, implement JWT or OAuth2 authentication and extract `userId` from the authenticated session.

## Rate Limiting

- 10 batch requests per hour per user
- Returns `429 Too Many Requests` when limit exceeded

## Endpoints

### 1. Create Batch Payment

Process multiple payments in a single batch.

**Endpoint:** `POST /api/transactions/batch`

**Headers:**

```
Content-Type: application/json
```

**Request Body:**

| Field       | Type   | Required | Description                       |
| ----------- | ------ | -------- | --------------------------------- |
| payments    | Array  | Yes      | Array of payment objects (max 50) |
| failureMode | String | Yes      | "continue" or "abort"             |

**Payment Object:**

| Field        | Type   | Required | Description                              |
| ------------ | ------ | -------- | ---------------------------------------- |
| recipientTag | String | Yes      | Recipient identifier (must start with @) |
| amount       | Number | Yes      | Payment amount (min: 0.0000001)          |
| asset        | String | Yes      | Asset type (e.g., "XLM")                 |
| memo         | String | No       | Optional payment memo                    |

**Example Request:**

```json
{
  "payments": [
    {
      "recipientTag": "@alice",
      "amount": 100.5,
      "asset": "XLM",
      "memo": "January salary"
    },
    {
      "recipientTag": "@bob",
      "amount": 250.75,
      "asset": "XLM",
      "memo": "January salary"
    }
  ],
  "failureMode": "continue"
}
```

**Response:** `202 Accepted`

```json
{
  "batchId": 123,
  "status": "pending",
  "totalPayments": 2,
  "successfulPayments": 0,
  "failedPayments": 0,
  "totalAmount": "351.25",
  "totalFees": "0.35",
  "results": [],
  "createdAt": "2024-02-21T10:00:00.000Z"
}
```

**Error Responses:**

- `400 Bad Request`: Invalid request format or validation errors
- `429 Too Many Requests`: Rate limit exceeded

---

### 2. Get Batch Payment Status

Retrieve the current status and results of a batch payment.

**Endpoint:** `GET /api/transactions/batch/:id`

**Path Parameters:**

| Parameter | Type    | Description      |
| --------- | ------- | ---------------- |
| id        | Integer | Batch payment ID |

**Example Request:**

```
GET /api/transactions/batch/123
```

**Response:** `200 OK`

```json
{
  "batchId": 123,
  "status": "completed",
  "totalPayments": 2,
  "successfulPayments": 2,
  "failedPayments": 0,
  "totalAmount": "351.25",
  "totalFees": "0.35",
  "results": [
    {
      "index": 0,
      "status": "success",
      "transactionId": 456
    },
    {
      "index": 1,
      "status": "success",
      "transactionId": 457
    }
  ],
  "createdAt": "2024-02-21T10:00:00.000Z",
  "completedAt": "2024-02-21T10:00:05.000Z"
}
```

**Error Responses:**

- `404 Not Found`: Batch payment not found or doesn't belong to user

---

## Status Values

### Batch Status

| Status     | Description                                                    |
| ---------- | -------------------------------------------------------------- |
| pending    | Batch created, waiting to be processed                         |
| processing | Currently processing payments                                  |
| completed  | All payments processed (may include failures in continue mode) |
| failed     | Batch failed (abort mode only)                                 |

### Payment Result Status

| Status  | Description                             |
| ------- | --------------------------------------- |
| success | Payment processed successfully          |
| failed  | Payment failed (includes error message) |

---

## Failure Modes

### Continue Mode

- Processes all payments independently
- Partial success is allowed
- Failed payments don't affect successful ones
- Final status: "completed" with mix of success/failed results

**Use Case:** Payroll where some payments can fail without affecting others

**Example Result:**

```json
{
  "status": "completed",
  "successfulPayments": 8,
  "failedPayments": 2,
  "results": [
    {"index": 0, "status": "success", "transactionId": 101},
    {"index": 1, "status": "failed", "error": "Insufficient funds"},
    ...
  ]
}
```

### Abort Mode

- Stops on first failure
- Rolls back all successful payments
- All payments marked as failed
- Final status: "failed"

**Use Case:** Atomic operations where all payments must succeed

**Example Result:**

```json
{
  "status": "failed",
  "successfulPayments": 0,
  "failedPayments": 10,
  "results": [
    {"index": 0, "status": "failed", "error": "Batch aborted"},
    {"index": 1, "status": "failed", "error": "Batch aborted"},
    ...
  ]
}
```

---

## Validation Rules

### Batch Level

- Minimum 1 payment per batch
- Maximum 50 payments per batch
- Valid failure mode: "continue" or "abort"

### Payment Level

- Recipient tag must start with "@"
- Amount must be positive (min: 0.0000001)
- Asset must be non-empty string
- Memo is optional

---

## Fee Calculation

Fees are calculated upfront before processing:

- Fee rate: 0.1% of payment amount
- Minimum fee: 0.01 per payment
- Total fees returned in batch response

**Example:**

- Payment: 100 XLM → Fee: 0.1 XLM
- Payment: 5 XLM → Fee: 0.01 XLM (minimum)

---

## Processing Details

### Concurrency

- Maximum 5 payments processed concurrently
- Prevents system overload
- Ensures predictable performance

### Processing Time

- Target: < 10s for 50 payments
- Actual time depends on blockchain confirmation
- Poll status endpoint for updates

### Background Processing

- Payments processed asynchronously via BullMQ
- Immediate response with batch ID
- Poll status endpoint for completion

---

## Error Handling

### Common Errors

| Error               | Cause                      | Solution                    |
| ------------------- | -------------------------- | --------------------------- |
| Insufficient funds  | User balance too low       | Reduce amount or add funds  |
| Invalid recipient   | Recipient tag format wrong | Use @ prefix                |
| Batch too large     | More than 50 payments      | Split into multiple batches |
| Rate limit exceeded | Too many requests          | Wait before retrying        |

### Error Response Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

---

## Best Practices

1. **Polling**: Poll status endpoint every 2-5 seconds
2. **Batch Size**: Use 20-30 payments per batch for optimal performance
3. **Failure Mode**: Use "continue" for payroll, "abort" for critical transfers
4. **Idempotency**: Store batch IDs to avoid duplicate submissions
5. **Error Handling**: Always check individual payment results

---

## Code Examples

### cURL

```bash
# Create batch payment
curl -X POST http://localhost:3000/api/transactions/batch \
  -H "Content-Type: application/json" \
  -d '{
    "payments": [
      {"recipientTag": "@user1", "amount": 100, "asset": "XLM"}
    ],
    "failureMode": "continue"
  }'

# Get status
curl http://localhost:3000/api/transactions/batch/1
```

### JavaScript/TypeScript

```typescript
// Create batch payment
const response = await fetch("http://localhost:3000/api/transactions/batch", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    payments: [{ recipientTag: "@user1", amount: 100, asset: "XLM" }],
    failureMode: "continue",
  }),
});

const batch = await response.json();

// Poll for status
const statusResponse = await fetch(
  `http://localhost:3000/api/transactions/batch/${batch.batchId}`,
);
const status = await statusResponse.json();
```

### Python

```python
import requests

# Create batch payment
response = requests.post(
    'http://localhost:3000/api/transactions/batch',
    json={
        'payments': [
            {'recipientTag': '@user1', 'amount': 100, 'asset': 'XLM'}
        ],
        'failureMode': 'continue'
    }
)

batch = response.json()

# Get status
status_response = requests.get(
    f'http://localhost:3000/api/transactions/batch/{batch["batchId"]}'
)
status = status_response.json()
```

---

## Performance Metrics

- Batch processing time: < 10s for 50 payments
- Success rate: > 95%
- Concurrency limit: 5 concurrent payments
- API call reduction: 95% vs individual payments

---

## Support

For issues or questions:

1. Check the README.md for setup instructions
2. Review QUICKSTART.md for common scenarios
3. Run tests: `npm test`
4. Check logs for detailed error messages
