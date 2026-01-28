# Webhook System Documentation

## Overview

The Tagged webhook system allows external applications to receive real-time notifications when events occur in the platform. This enables integration with third-party services, automation workflows, and custom monitoring solutions.

## Features

- ✅ Multiple webhook URLs per account
- ✅ Event-based subscriptions
- ✅ HMAC-SHA256 signature verification
- ✅ Automatic retry with exponential backoff
- ✅ Delivery logging and statistics
- ✅ Test webhook endpoint

## Supported Events

| Event Type | Description | Payload Fields |
|------------|-------------|----------------|
| `payment.received` | Triggered when account receives a payment | `accountTag`, `from`, `amount`, `asset`, `transactionHash` |
| `payment.sent` | Triggered when account sends a payment | `accountTag`, `to`, `amount`, `asset`, `transactionHash` |
| `account.created` | Triggered when a new account is created | `accountTag`, `publicKey`, `balance`, `createdAt` |
| `balance.update` | Triggered when account balance changes | `accountTag`, `previousBalance`, `newBalance`, `timestamp` |

## API Endpoints

### Register Webhook

```http
POST /api/v1/webhooks
Content-Type: application/json

{
  "accountTag": "johndoe",
  "url": "https://your-server.com/webhook",
  "events": ["account.created", "payment.received"],
  "secret": "optional-custom-secret"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "accountTag": "johndoe",
    "url": "https://your-server.com/webhook",
    "events": ["account.created", "payment.received"],
    "secret": "generated-or-custom-secret",
    "isActive": true,
    "createdAt": "2026-01-22T12:00:00Z",
    "updatedAt": "2026-01-22T12:00:00Z"
  }
}
```

### List Webhooks

```http
GET /api/v1/webhooks?accountTag=johndoe
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "accountTag": "johndoe",
      "url": "https://your-server.com/webhook",
      "events": ["account.created"],
      "isActive": true,
      "createdAt": "2026-01-22T12:00:00Z"
    }
  ]
}
```

### Get Webhook Details

```http
GET /api/v1/webhooks/:id?accountTag=johndoe
```

### Update Webhook

```http
PATCH /api/v1/webhooks/:id?accountTag=johndoe
Content-Type: application/json

{
  "isActive": false,
  "events": ["payment.received", "payment.sent"]
}
```

### Delete Webhook

```http
DELETE /api/v1/webhooks/:id?accountTag=johndoe
```

### Get Delivery Logs

```http
GET /api/v1/webhooks/:id/deliveries?accountTag=johndoe&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": {
    "deliveries": [
      {
        "id": "uuid",
        "eventType": "account.created",
        "status": "success",
        "attempts": 1,
        "responseStatus": 200,
        "createdAt": "2026-01-22T12:00:00Z",
        "deliveredAt": "2026-01-22T12:00:01Z"
      }
    ],
    "stats": {
      "total": 100,
      "success": 95,
      "failed": 3,
      "pending": 2
    }
  }
}
```

### Test Webhook

```http
POST /api/v1/webhooks/:id/test?accountTag=johndoe
```

Sends a test `account.created` event to verify your webhook endpoint is working.

## Webhook Payload Format

All webhook notifications are sent as HTTP POST requests with the following format:

```json
{
  "eventType": "account.created",
  "timestamp": "2026-01-22T12:00:00.000Z",
  "data": {
    "accountTag": "johndoe",
    "publicKey": "GABC...",
    "balance": "10000.0000000",
    "createdAt": "2026-01-22T12:00:00.000Z"
  }
}
```

## Signature Verification

Each webhook request includes an `X-Webhook-Signature` header containing an HMAC-SHA256 signature. **You should always verify this signature** to ensure the request came from Tagged.

### Verification Example (Node.js)

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// In your webhook endpoint
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = 'your-webhook-secret';
  
  if (!verifyWebhookSignature(req.body, signature, secret)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process the webhook
  console.log('Event type:', req.body.eventType);
  console.log('Data:', req.body.data);
  
  res.status(200).send('OK');
});
```

### Verification Example (Python)

```python
import hmac
import hashlib
import json

def verify_webhook_signature(payload, signature, secret):
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        json.dumps(payload, separators=(',', ':')).encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)

# In your webhook endpoint (Flask example)
@app.route('/webhook', methods=['POST'])
def webhook():
    signature = request.headers.get('X-Webhook-Signature')
    secret = 'your-webhook-secret'
    
    if not verify_webhook_signature(request.json, signature, secret):
        return 'Invalid signature', 401
    
    # Process the webhook
    event_type = request.json['eventType']
    data = request.json['data']
    
    return 'OK', 200
```

## Retry Logic

If your webhook endpoint fails to respond or returns an error status code (non-2xx), Tagged will automatically retry delivery with exponential backoff:

- **Attempt 1**: Immediate
- **Attempt 2**: After 1 minute
- **Attempt 3**: After 5 minutes
- **Attempt 4**: After 30 minutes

After 3 failed attempts, the webhook delivery is marked as `failed` and will not be retried further. You can view failed deliveries in the delivery logs.

## Best Practices

### 1. Respond Quickly
Your webhook endpoint should respond within 5 seconds. Process the event asynchronously if needed.

```javascript
app.post('/webhook', async (req, res) => {
  // Verify signature
  if (!verifyWebhookSignature(req.body, req.headers['x-webhook-signature'], secret)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Respond immediately
  res.status(200).send('OK');
  
  // Process asynchronously
  processWebhook(req.body).catch(console.error);
});
```

### 2. Handle Duplicates
Due to retries, you may receive the same event multiple times. Implement idempotency using the event timestamp or a unique ID.

```javascript
const processedEvents = new Set();

async function processWebhook(payload) {
  const eventId = `${payload.eventType}-${payload.timestamp}`;
  
  if (processedEvents.has(eventId)) {
    console.log('Duplicate event, skipping');
    return;
  }
  
  processedEvents.add(eventId);
  // Process the event...
}
```

### 3. Use HTTPS
Always use HTTPS URLs for your webhook endpoint to ensure secure transmission.

### 4. Store Secrets Securely
Never commit webhook secrets to version control. Use environment variables or a secrets management service.

### 5. Monitor Delivery Logs
Regularly check the delivery logs endpoint to monitor webhook health and debug issues.

## Testing Webhooks Locally

### Using webhook.site

1. Go to [webhook.site](https://webhook.site)
2. Copy the unique URL
3. Register it as a webhook:
   ```bash
   curl -X POST http://localhost:3000/webhooks \
     -H "Content-Type: application/json" \
     -d '{
       "accountTag": "testuser",
       "url": "https://webhook.site/your-unique-id",
       "events": ["account.created"]
     }'
   ```
4. Trigger an event (e.g., create an account)
5. View the webhook delivery on webhook.site

### Using ngrok

1. Start ngrok:
   ```bash
   ngrok http 4000
   ```

2. Note the HTTPS URL (e.g., `https://abc123.ngrok.io`)

3. Create a local webhook handler:
   ```javascript
   const express = require('express');
   const app = express();
   app.use(express.json());
   
   app.post('/webhook', (req, res) => {
     console.log('Webhook received:', req.body);
     res.status(200).send('OK');
   });
   
   app.listen(4000, () => console.log('Webhook server running on port 4000'));
   ```

4. Register the ngrok URL:
   ```bash
   curl -X POST http://localhost:3000/webhooks \
     -H "Content-Type: application/json" \
     -d '{
       "accountTag": "testuser",
       "url": "https://abc123.ngrok.io/webhook",
       "events": ["account.created"]
     }'
   ```

## Troubleshooting

### Webhook not being called

1. Check if the webhook is active: `GET /webhooks/:id`
2. Verify the events array includes the triggered event
3. Check delivery logs for error details: `GET /webhooks/:id/deliveries`

### Signature verification failing

1. Ensure you're using the exact payload body (don't modify it)
2. Verify you're using the correct secret from the webhook registration
3. Make sure you're JSON.stringify() the payload before hashing
4. Use `timingSafeEqual` or `compare_digest` for comparison

### High failure rate

1. Ensure your endpoint responds within 5 seconds
2. Check server logs for errors
3. Verify your endpoint is publicly accessible
4. Test with the `/test` endpoint first

## Support

For questions or issues with the webhook system, please open an issue on GitHub.
