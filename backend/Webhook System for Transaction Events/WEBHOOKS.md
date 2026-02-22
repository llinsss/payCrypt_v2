# Webhook Integration Guide

## Overview

Subscribe to real-time transaction events via webhooks. When a transaction event occurs, we POST a signed JSON payload to your endpoint within 5 seconds.

---

## Quick Start

### 1. Register a Webhook

```http
POST /api/webhooks
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://your-app.com/webhooks/transactions",
  "events": ["transaction.completed", "transaction.failed"]
}
```

**Response:**
```json
{
  "id": 1,
  "url": "https://your-app.com/webhooks/transactions",
  "secret": "a3f8c2...",   ← store this securely
  "events": ["transaction.completed", "transaction.failed"],
  "active": true
}
```

> **Keep your secret safe.** It is only shown once. Use it to verify payload signatures.

---

## Supported Events

| Event                    | Fired when…                       |
|--------------------------|-----------------------------------|
| `transaction.created`    | A new transaction is initiated    |
| `transaction.completed`  | Transaction confirmed on-chain    |
| `transaction.failed`     | Transaction failed or was rejected|

---

## Payload Format

```json
{
  "event": "transaction.completed",
  "timestamp": "2024-02-21T10:30:00.000Z",
  "data": {
    "id": 12345,
    "user_id": 42,
    "amount": "100.00",
    "status": "completed",
    "hash": "0xabc..."
  }
}
```

### Request Headers

| Header                  | Description                        |
|-------------------------|------------------------------------|
| `X-Webhook-Signature`   | HMAC-SHA256 hex signature          |
| `X-Webhook-Timestamp`   | Unix timestamp (ms) of delivery    |
| `Content-Type`          | `application/json`                 |

---

## Verifying Signatures

Always verify the `X-Webhook-Signature` header before processing a webhook.

### Node.js

```javascript
const crypto = require('crypto');

function verifyWebhook(req, secret) {
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body); // must match exactly

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// Express example
app.post('/webhooks/transactions', express.json(), (req, res) => {
  if (!verifyWebhook(req, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  // process event…
  res.sendStatus(200);
});
```

### Python

```python
import hmac, hashlib, json

def verify_webhook(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
```

---

## Retry Policy

Failed deliveries (non-2xx response or connection error) are retried automatically:

| Attempt | Delay after previous failure |
|---------|------------------------------|
| 1st     | Immediate                    |
| 2nd     | 1 second                     |
| 3rd     | 10 seconds                   |
| 4th     | 60 seconds                   |

After 4 attempts with no success the delivery is marked **failed** and will not be retried.

---

## Delivery Logs

```http
GET /api/webhooks/:id/deliveries?limit=50&offset=0
```

```json
[
  [
    {
      "id": 101,
      "eventType": "transaction.completed",
      "status": "success",
      "responseCode": 200,
      "attempts": 1,
      "lastAttemptAt": "2024-02-21T10:30:01.000Z",
      "createdAt": "2024-02-21T10:30:00.000Z"
    }
  ],
  1
]
```

Delivery logs are retained for **30 days**.

---

## Rate Limits

Webhook deliveries are rate-limited to **100 per minute per user** to protect your endpoint from bursts.

---

## REST API Reference

| Method   | Path                              | Description             |
|----------|-----------------------------------|-------------------------|
| `POST`   | `/api/webhooks`                   | Register endpoint       |
| `GET`    | `/api/webhooks`                   | List your webhooks      |
| `GET`    | `/api/webhooks/:id`               | Get a webhook           |
| `PUT`    | `/api/webhooks/:id`               | Update a webhook        |
| `DELETE` | `/api/webhooks/:id`               | Remove a webhook        |
| `GET`    | `/api/webhooks/:id/deliveries`    | View delivery logs      |

---

## Best Practices

- **Respond quickly.** Return `2xx` within 5 seconds or the delivery will be retried.
- **Be idempotent.** You may receive the same event more than once during retries; use the `data.id` field to deduplicate.
- **Use HTTPS.** Plaintext HTTP endpoints are accepted but HTTPS is strongly recommended.
- **Verify signatures.** Never process a webhook payload without checking the `X-Webhook-Signature`.
