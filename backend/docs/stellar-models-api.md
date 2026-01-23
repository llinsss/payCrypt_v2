# Stellar Models API Reference

Quick reference guide for using the Stellar SDK database models.

## Import Models

```javascript
import {
  StellarTag,
  StellarAccount,
  StellarTransaction,
  Webhook,
  WebhookEvent
} from './models/index.js';
```

## StellarTag

### Methods

```javascript
// Find by tag
const tag = await StellarTag.findByTag('@alice');

// Find by Stellar address
const tag = await StellarTag.findByAddress('GXXX...');

// Find by ID
const tag = await StellarTag.findById(1);

// Create new tag
const tag = await StellarTag.create({
  tag: '@alice',
  stellar_address: 'GXXX...'
});

// Update tag
const tag = await StellarTag.update(1, {
  stellar_address: 'GYYY...'
});

// Delete tag
await StellarTag.delete(1);

// Get all tags (paginated)
const tags = await StellarTag.getAll(100, 0);

// Search tags
const results = await StellarTag.search('ali', 10);
```

## StellarAccount

### Methods

```javascript
// Find by Stellar address
const account = await StellarAccount.findByAddress('GXXX...');

// Find by ID
const account = await StellarAccount.findById(1);

// Find by user ID
const accounts = await StellarAccount.findByUserId(123);

// Create new account
const account = await StellarAccount.create({
  stellar_address: 'GXXX...',
  public_key: 'GXXX...',
  user_id: 123,
  account_type: 'standard',
  xlm_balance: 1000.0,
  balances: [{ asset_code: 'XLM', balance: '1000.0' }]
});

// Update account
const account = await StellarAccount.update('GXXX...', {
  xlm_balance: 1500.0
});

// Update balance
const account = await StellarAccount.updateBalance(
  'GXXX...',
  1500.0,
  [{ asset_code: 'XLM', balance: '1500.0' }]
);

// Delete account
await StellarAccount.delete(1);

// Get all accounts (paginated)
const accounts = await StellarAccount.getAll(100, 0);

// Get active accounts
const active = await StellarAccount.getActive(100, 0);

// Set account inactive
await StellarAccount.setInactive('GXXX...');
```

## StellarTransaction

### Methods

```javascript
// Find by transaction hash
const tx = await StellarTransaction.findByHash('abc123...');

// Find by ID
const tx = await StellarTransaction.findById(1);

// Find by address (paginated)
const txs = await StellarTransaction.findByAddress('GXXX...', 50, 0);

// Find by status
const pending = await StellarTransaction.findByStatus('pending', 100, 0);

// Create new transaction
const tx = await StellarTransaction.create({
  transaction_hash: 'abc123...',
  stellar_address: 'GXXX...',
  source_account: 'GXXX...',
  destination_account: 'GYYY...',
  transaction_type: 'payment',
  asset_code: 'XLM',
  amount: 100.0,
  fee: 0.00001,
  status: 'success',
  is_incoming: true
});

// Update transaction
const tx = await StellarTransaction.update('abc123...', {
  status: 'success'
});

// Update status only
const tx = await StellarTransaction.updateStatus('abc123...', 'success');

// Delete transaction
await StellarTransaction.delete(1);

// Get incoming transactions
const incoming = await StellarTransaction.getIncoming('GXXX...', 50, 0);

// Get outgoing transactions
const outgoing = await StellarTransaction.getOutgoing('GXXX...', 50, 0);

// Get transactions by date range
const txs = await StellarTransaction.getByDateRange(
  'GXXX...',
  '2024-01-01',
  '2024-12-31'
);

// Get total volume
const volume = await StellarTransaction.getTotalVolume('GXXX...', 'XLM');
```

## Webhook

### Methods

```javascript
// Find by ID
const webhook = await Webhook.findById(1);

// Find by user ID
const webhooks = await Webhook.findByUserId(123);

// Find active webhooks
const active = await Webhook.findActive();
const userActive = await Webhook.findActive(123);

// Create new webhook
const webhook = await Webhook.create({
  user_id: 123,
  url: 'https://example.com/webhook',
  secret: 'your_secret_key',
  events: ['transaction.created', 'transaction.confirmed'],
  max_retries: 3
});

// Update webhook
const webhook = await Webhook.update(1, {
  url: 'https://example.com/new-webhook'
});

// Update status
const webhook = await Webhook.updateStatus(1, 'active');
const webhook = await Webhook.updateStatus(1, 'failed', 'Connection timeout');

// Increment retry count
const webhook = await Webhook.incrementRetry(1);

// Record trigger
await Webhook.recordTrigger(1, true);  // success
await Webhook.recordTrigger(1, false); // failure

// Delete webhook
await Webhook.delete(1);

// Deactivate webhook
await Webhook.deactivate(1);

// Activate webhook
await Webhook.activate(1);

// Get webhooks by event type
const webhooks = await Webhook.getByEvent('transaction.created');
```

## WebhookEvent

### Methods

```javascript
// Find by ID
const event = await WebhookEvent.findById(1);

// Find by webhook ID (paginated)
const events = await WebhookEvent.findByWebhookId(1, 50, 0);

// Find pending events
const pending = await WebhookEvent.findPending(100);

// Create new event
const event = await WebhookEvent.create({
  webhook_id: 1,
  event_type: 'transaction.created',
  payload: { transaction_id: 123, amount: 100 },
  status: 'pending',
  next_retry_at: new Date()
});

// Update event
const event = await WebhookEvent.update(1, {
  status: 'success'
});

// Mark as success
const event = await WebhookEvent.markSuccess(1, 200, 'OK');

// Mark as failed
const event = await WebhookEvent.markFailed(1, 'Connection timeout', 500);

// Schedule retry
const nextRetry = new Date(Date.now() + 60000); // 1 minute
const event = await WebhookEvent.scheduleRetry(1, nextRetry);

// Delete event
await WebhookEvent.delete(1);

// Delete old events
const deleted = await WebhookEvent.deleteOld(30); // older than 30 days

// Get statistics
const stats = await WebhookEvent.getStats(1);
// Returns: { total, success, failed, pending }
```

## Common Patterns

### Tag Resolution

```javascript
// Resolve @tag to Stellar address
async function resolveTag(tag) {
  const result = await StellarTag.findByTag(tag);
  return result?.stellar_address;
}

// Usage
const address = await resolveTag('@alice');
```

### Transaction History

```javascript
// Get recent transactions for an account
async function getRecentTransactions(address, limit = 20) {
  return await StellarTransaction.findByAddress(address, limit, 0);
}

// Get transaction summary
async function getTransactionSummary(address) {
  const incoming = await StellarTransaction.getIncoming(address, 100, 0);
  const outgoing = await StellarTransaction.getOutgoing(address, 100, 0);
  const volume = await StellarTransaction.getTotalVolume(address);
  
  return {
    incoming: incoming.length,
    outgoing: outgoing.length,
    totalVolume: volume
  };
}
```

### Webhook Management

```javascript
// Register webhook for user
async function registerWebhook(userId, url, events) {
  const crypto = await import('crypto');
  const secret = crypto.randomBytes(32).toString('hex');
  
  return await Webhook.create({
    user_id: userId,
    url,
    secret,
    events,
    max_retries: 3
  });
}

// Trigger webhook
async function triggerWebhook(webhookId, eventType, payload) {
  const webhook = await Webhook.findById(webhookId);
  if (!webhook || !webhook.is_active) return;
  
  // Create event
  const event = await WebhookEvent.create({
    webhook_id: webhookId,
    event_type: eventType,
    payload,
    status: 'pending',
    next_retry_at: new Date()
  });
  
  // Trigger delivery (implement separately)
  // ...
}
```

### Account Sync

```javascript
// Sync account from Stellar network
async function syncAccount(stellarAddress, accountData) {
  const existing = await StellarAccount.findByAddress(stellarAddress);
  
  if (existing) {
    return await StellarAccount.update(stellarAddress, {
      xlm_balance: accountData.xlm_balance,
      balances: accountData.balances,
      sequence_number: accountData.sequence_number,
      last_synced_at: new Date()
    });
  } else {
    return await StellarAccount.create({
      stellar_address: stellarAddress,
      public_key: stellarAddress,
      ...accountData
    });
  }
}
```

## Error Handling

```javascript
// Always wrap database calls in try-catch
try {
  const tag = await StellarTag.findByTag('@alice');
  if (!tag) {
    throw new Error('Tag not found');
  }
  // Process tag...
} catch (error) {
  console.error('Database error:', error);
  // Handle error appropriately
}
```

## Transaction Support

```javascript
import db from './config/database.js';

// Use transactions for atomic operations
async function transferTag(oldTag, newTag, stellarAddress) {
  const trx = await db.transaction();
  
  try {
    // Delete old tag
    await trx('stellar_tags').where({ tag: oldTag }).del();
    
    // Create new tag
    await trx('stellar_tags').insert({
      tag: newTag,
      stellar_address: stellarAddress
    });
    
    await trx.commit();
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}
```

## Performance Tips

1. **Use pagination** for large result sets
2. **Leverage indexes** - queries on indexed columns are faster
3. **Batch operations** when possible
4. **Use transactions** for multiple related operations
5. **Cache frequently accessed data** (e.g., tag lookups)
6. **Monitor slow queries** and optimize as needed

## Best Practices

1. **Validate input** before database operations
2. **Handle errors gracefully** with try-catch
3. **Use transactions** for data consistency
4. **Clean up old data** periodically (webhook events)
5. **Monitor connection pool** usage
6. **Log database errors** for debugging
