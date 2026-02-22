# Payment System - Developer Quick Start Guide

## Quick Reference

### 1. Process a Payment

```javascript
import PaymentService from './services/PaymentService.js';

// Simple XLM payment
const result = await PaymentService.processPayment({
  senderTag: 'alice',
  recipientTag: 'bob',
  amount: 100,
  asset: 'XLM',
  memo: 'Payment for services',
  secrets: [senderSecret],
  userId: 1
});

console.log(result);
// {
//   success: true,
//   transactionId: 123,
//   txHash: '1234567890abcdef...',
//   ledger: 12345,
//   amount: 100,
//   fee: 0.10001,
//   asset: 'XLM',
//   senderTag: 'alice',
//   recipientTag: 'bob',
//   timestamp: '2026-01-25T10:30:00Z'
// }
```

### 2. Check Payment Limits

```javascript
const limits = PaymentService.getPaymentLimits();
console.log(limits);
// {
//   maxAmount: 1000000,
//   minAmount: 0.00001,
//   baseFeePercentage: 0.1,
//   minFee: 0.00001
// }
```

### 3. Calculate Fees

```javascript
const feeInfo = PaymentService.calculateFee(100, 'XLM');
console.log(feeInfo);
// {
//   fee: 0.10001,
//   baseFee: 0.1,
//   networkFee: 0.00001,
//   percentage: 0.1
// }
```

### 4. Get Transaction History

```javascript
const history = await PaymentService.getTransactionHistory('alice', {
  limit: 20,
  offset: 0,
  sortBy: 'created_at',
  sortOrder: 'desc'
});

console.log(history);
// Array of transaction records
```

### 5. Resolve a Tag

```javascript
const address = await PaymentService.resolveTag('alice');
console.log(address);
// 'GXXXXXXX...'
```

### 6. Check Balance

```javascript
const balance = await PaymentService.getBalance(
  'GXXXXXXX...',
  'XLM'
);
console.log(balance);
// 1000.5
```

---

## HTTP API Examples

### Process Payment

```bash
curl -X POST http://localhost:3000/api/transactions/payment \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "senderTag": "alice",
    "recipientTag": "bob",
    "amount": 100,
    "asset": "XLM",
    "memo": "Payment for services",
    "senderSecret": "SXXXXXXX...",
    "additionalSecrets": []
  }'
```

### Get Payment Limits

```bash
curl http://localhost:3000/api/transactions/payment/limits
```

### Get Transaction History

```bash
curl "http://localhost:3000/api/transactions/tag/alice/history?limit=20&offset=0&sortOrder=desc"
```

---

## Error Handling

### Insufficient Funds

```javascript
try {
  await PaymentService.processPayment({...});
} catch (error) {
  if (error.message.includes('Insufficient funds')) {
    console.log('Not enough balance');
    // Handle insufficient funds
  }
}
```

### Tag Not Found

```javascript
try {
  await PaymentService.resolveTag('nonexistent');
} catch (error) {
  if (error.message.includes('not found')) {
    console.log('Tag does not exist');
    // Handle missing tag
  }
}
```

### Network Error

```javascript
try {
  await PaymentService.processPayment({...});
} catch (error) {
  if (error.message.includes('network')) {
    console.log('Network error - will retry automatically');
    // Network errors are retried automatically (3 attempts)
  }
}
```

---

## Multi-Signature Payments

```javascript
// For multi-sig accounts, provide multiple secrets
const result = await PaymentService.processPayment({
  senderTag: 'alice',
  recipientTag: 'bob',
  amount: 100,
  asset: 'XLM',
  secrets: [
    'SXXXXXXX...',  // First signer
    'SYYYYYYY...',  // Second signer
    'SZZZZZZ...'    // Third signer (if needed)
  ],
  userId: 1
});
```

---

## Custom Asset Transfers

```javascript
const result = await PaymentService.processPayment({
  senderTag: 'alice',
  recipientTag: 'bob',
  amount: 50,
  asset: 'USDC',
  assetIssuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2',
  memo: 'USDC payment',
  secrets: [senderSecret],
  userId: 1
});
```

---

## Database Queries

### Get Transaction by ID

```javascript
import Transaction from './models/Transaction.js';

const tx = await Transaction.findById(123);
console.log(tx);
```

### Get User Transactions

```javascript
const transactions = await Transaction.getByUser(userId, {
  limit: 20,
  offset: 0
});
```

### Get Transactions by Tag

```javascript
import User from './models/User.js';

const user = await User.findByTag('alice');
const transactions = await Transaction.getByUser(user.id, {
  limit: 20,
  offset: 0
});
```

---

## Configuration

### Payment Limits

Edit `PaymentService.js`:

```javascript
const PAYMENT_CONFIG = {
  MAX_AMOUNT: 1000000,           // Change max amount
  MIN_AMOUNT: 0.00001,           // Change min amount
  BASE_FEE_PERCENTAGE: 0.001,    // Change fee percentage (0.1%)
  MIN_FEE: 0.00001,              // Change minimum fee
  NETWORK_TIMEOUT: 30,           // Change timeout (seconds)
  MAX_RETRIES: 3,                // Change retry attempts
  RETRY_DELAY_MS: 1000,          // Change retry delay
  ACCOUNT_RESERVE: 2,            // Change account reserve
};
```

### Stellar Network

```javascript
// In PaymentService constructor
this.server = new Server('https://horizon.stellar.org');  // PUBLIC
// or
this.server = new Server('https://horizon-testnet.stellar.org');  // TESTNET

this.networkPassphrase = Networks.PUBLIC;  // or Networks.TESTNET_NETWORK
```

---

## Validation Rules

### Tag Format
- Pattern: `/^[a-zA-Z0-9_]{3,20}$/`
- Examples: `alice`, `bob_smith`, `user123`
- Invalid: `ab` (too short), `alice@bob` (invalid char)

### Amount
- Min: 0.00001 XLM
- Max: 1,000,000 XLM
- Examples: `100`, `0.5`, `0.00001`

### Asset Code
- Pattern: `/^[A-Z0-9]{1,12}$/`
- Examples: `XLM`, `USDC`, `EUR`
- Invalid: `usdc` (lowercase), `VERYLONGASSETCODE` (too long)

### Stellar Address
- Pattern: `/^G[A-Z0-9]{55}$/`
- Example: `GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2`

### Secret Key
- Pattern: `/^S[A-Z0-9]{55}$/`
- Example: `SBZVMB74Z76QZ3ZVK444XFBK5NJ4ZCZQU3Z5G3JRCN4GTIUQTWMBTOP5`

### Memo
- Max length: 28 characters
- Examples: `Payment for services`, `Invoice #123`

---

## Common Issues & Solutions

### Issue: "Tag not found"
**Solution:** Ensure the tag exists in the `stellar_tags` table
```sql
SELECT * FROM stellar_tags WHERE tag = 'alice';
```

### Issue: "Insufficient funds"
**Solution:** Check account balance
```javascript
const balance = await PaymentService.getBalance(address, 'XLM');
console.log(`Balance: ${balance} XLM`);
```

### Issue: "Multi-signature account requires at least 2 signatures"
**Solution:** Provide all required secret keys
```javascript
secrets: [secret1, secret2, secret3]  // All signers
```

### Issue: "Network error - will retry"
**Solution:** This is automatic. The system retries 3 times with exponential backoff.

### Issue: "Invalid Stellar address format"
**Solution:** Ensure address starts with 'G' and is 56 characters total
```javascript
// Valid: GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2
// Invalid: GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL  (too short)
```

---

## Testing

### Test Payment (Testnet)

```javascript
// 1. Create test tags
await TagService.createTag('test_alice', 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2');
await TagService.createTag('test_bob', 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2');

// 2. Process payment
const result = await PaymentService.processPayment({
  senderTag: 'test_alice',
  recipientTag: 'test_bob',
  amount: 10,
  asset: 'XLM',
  secrets: [testSecret],
  userId: 1
});

console.log('Payment successful:', result.txHash);
```

---

## Performance Tips

1. **Batch Operations:** Process multiple payments sequentially, not in parallel
2. **Cache Balances:** Don't check balance multiple times in quick succession
3. **Use Testnet:** Test on testnet before production
4. **Monitor Retries:** Watch logs for network errors and adjust retry config if needed
5. **Database Indexes:** Ensure indexes on `stellar_tags.tag` and `transactions.user_id`

---

## Security Best Practices

1. **Never Log Secrets:** Don't log secret keys anywhere
2. **Use HTTPS:** Always use HTTPS in production
3. **Validate Input:** Always validate user input (schemas do this)
4. **Rate Limit:** Enable rate limiting on payment endpoint
5. **Audit Logs:** Log all payment attempts for audit trail
6. **Backup Keys:** Securely backup secret keys
7. **Rotate Keys:** Rotate keys periodically
8. **Monitor Accounts:** Monitor account activity for suspicious transactions

---

## Monitoring & Logging

### Key Metrics to Monitor

```javascript
// Payment success rate
SELECT COUNT(*) as total, 
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful
FROM transactions
WHERE type = 'payment'
AND created_at > NOW() - INTERVAL '24 hours';

// Average payment amount
SELECT AVG(amount) as avg_amount, 
       SUM(amount) as total_amount
FROM transactions
WHERE type = 'payment'
AND status = 'completed';

// Failed payments
SELECT * FROM transactions
WHERE type = 'payment'
AND status != 'completed'
ORDER BY created_at DESC;
```

### Log Levels

- **INFO:** Payment processing steps
- **WARN:** Retry attempts, network errors
- **ERROR:** Payment failures, validation errors

---

## Support & Documentation

- **Full Documentation:** See `CORE_PAYMENT_IMPLEMENTATION.md`
- **API Reference:** See `PAYMENT_SYSTEM.md`
- **Quick Reference:** See `PAYMENT_QUICK_REFERENCE.md`
- **Deployment:** See `DEPLOYMENT_CHECKLIST.md`

---

## Version Info

- **Stellar SDK:** v12.0.0
- **Node.js:** v16+ recommended
- **Database:** PostgreSQL 12+
- **Implementation Date:** January 25, 2026
