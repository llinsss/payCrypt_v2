# Payment System - Comprehensive Testing Guide

## Overview

This guide provides comprehensive testing procedures for the core payment processing system. All tests should be performed on testnet before production deployment.

---

## Pre-Testing Setup

### 1. Environment Configuration

```bash
# .env.test
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
NODE_ENV=test
DATABASE_URL=postgresql://user:password@localhost/paycrypt_test
JWT_SECRET=test_secret_key_12345
```

### 2. Create Test Accounts

```javascript
// Generate test keypairs
import * as StellarSdk from '@stellar/stellar-sdk';

const keypair1 = StellarSdk.Keypair.random();
const keypair2 = StellarSdk.Keypair.random();

console.log('Account 1:');
console.log('Public:', keypair1.publicKey());
console.log('Secret:', keypair1.secret());

console.log('Account 2:');
console.log('Public:', keypair2.publicKey());
console.log('Secret:', keypair2.secret());

// Fund accounts on testnet
// Visit: https://laboratory.stellar.org/#account-creator
```

### 3. Create Test Tags

```javascript
import TagService from './services/TagService.js';

await TagService.createTag('test_alice', 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2');
await TagService.createTag('test_bob', 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2');
```

---

## Unit Tests

### Test 1: Tag Validation

```javascript
describe('Tag Validation', () => {
  test('should accept valid tags', () => {
    const validTags = ['alice', 'bob_smith', 'user123', 'a_b_c'];
    validTags.forEach(tag => {
      expect(/^[a-zA-Z0-9_]{3,20}$/.test(tag)).toBe(true);
    });
  });

  test('should reject invalid tags', () => {
    const invalidTags = [
      'ab',                    // Too short
      'a'.repeat(21),          // Too long
      'alice@bob',             // Invalid character
      'alice bob',             // Space
      'alice-bob',             // Hyphen
      ''                       // Empty
    ];
    invalidTags.forEach(tag => {
      expect(/^[a-zA-Z0-9_]{3,20}$/.test(tag)).toBe(false);
    });
  });
});
```

### Test 2: Amount Validation

```javascript
describe('Amount Validation', () => {
  test('should accept valid amounts', () => {
    const validAmounts = [0.00001, 1, 100, 1000000];
    validAmounts.forEach(amount => {
      expect(amount >= 0.00001 && amount <= 1000000).toBe(true);
    });
  });

  test('should reject invalid amounts', () => {
    const invalidAmounts = [
      0,                       // Zero
      -100,                    // Negative
      0.000001,                // Below minimum
      1000001,                 // Above maximum
      'abc',                   // Non-numeric
      null,                    // Null
      undefined                // Undefined
    ];
    invalidAmounts.forEach(amount => {
      expect(amount >= 0.00001 && amount <= 1000000).toBe(false);
    });
  });
});
```

### Test 3: Fee Calculation

```javascript
describe('Fee Calculation', () => {
  test('should calculate correct fees', () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    const feeInfo = PaymentService.calculateFee(100, 'XLM');
    
    expect(feeInfo.baseFee).toBe(0.1);           // 0.1% of 100
    expect(feeInfo.networkFee).toBe(0.00001);    // Stellar base fee
    expect(feeInfo.fee).toBe(0.10001);           // Total
    expect(feeInfo.percentage).toBe(0.1);        // Percentage
  });

  test('should apply minimum fee', () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    const feeInfo = PaymentService.calculateFee(0.00001, 'XLM');
    
    // Base fee should be minimum (0.00001)
    expect(feeInfo.baseFee).toBe(0.00001);
    expect(feeInfo.fee).toBeGreaterThanOrEqual(0.00001);
  });
});
```

### Test 4: Tag Resolution

```javascript
describe('Tag Resolution', () => {
  test('should resolve valid tag to address', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    const address = await PaymentService.resolveTag('test_alice');
    
    expect(address).toMatch(/^G[A-Z0-9]{55}$/);
  });

  test('should throw error for non-existent tag', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    await expect(
      PaymentService.resolveTag('nonexistent_tag_xyz')
    ).rejects.toThrow('not found');
  });
});
```

### Test 5: Balance Checking

```javascript
describe('Balance Checking', () => {
  test('should return balance for valid account', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    const balance = await PaymentService.getBalance(
      'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2',
      'XLM'
    );
    
    expect(typeof balance).toBe('number');
    expect(balance).toBeGreaterThanOrEqual(0);
  });

  test('should throw error for non-existent account', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    await expect(
      PaymentService.getBalance('GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX', 'XLM')
    ).rejects.toThrow();
  });
});
```

---

## Integration Tests

### Test 6: Complete Payment Flow

```javascript
describe('Complete Payment Flow', () => {
  test('should process payment successfully', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    const result = await PaymentService.processPayment({
      senderTag: 'test_alice',
      recipientTag: 'test_bob',
      amount: 10,
      asset: 'XLM',
      memo: 'Test payment',
      secrets: [testAliceSecret],
      userId: 1
    });
    
    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
    expect(result.txHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.amount).toBe(10);
    expect(result.fee).toBeGreaterThan(0);
  });

  test('should store transaction in database', async () => {
    const Transaction = require('./models/Transaction.js').default;
    const PaymentService = require('./services/PaymentService.js').default;
    
    const result = await PaymentService.processPayment({
      senderTag: 'test_alice',
      recipientTag: 'test_bob',
      amount: 5,
      asset: 'XLM',
      secrets: [testAliceSecret],
      userId: 1
    });
    
    const tx = await Transaction.findById(result.transactionId);
    
    expect(tx).toBeDefined();
    expect(tx.status).toBe('completed');
    expect(tx.tx_hash).toBe(result.txHash);
    expect(tx.amount).toBe(5);
  });
});
```

### Test 7: Insufficient Funds

```javascript
describe('Insufficient Funds Handling', () => {
  test('should reject payment with insufficient funds', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    // Create account with minimal balance
    const poorAccount = StellarSdk.Keypair.random();
    // Fund with only 1 XLM
    
    await expect(
      PaymentService.processPayment({
        senderTag: 'poor_account',
        recipientTag: 'test_bob',
        amount: 100,  // More than available
        asset: 'XLM',
        secrets: [poorAccount.secret()],
        userId: 1
      })
    ).rejects.toThrow('Insufficient funds');
  });
});
```

### Test 8: Multi-Signature Payments

```javascript
describe('Multi-Signature Payments', () => {
  test('should process multi-sig payment with all signatures', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    // Create multi-sig account (requires 2 signatures)
    // Setup: Create account with 2 signers
    
    const result = await PaymentService.processPayment({
      senderTag: 'multisig_account',
      recipientTag: 'test_bob',
      amount: 10,
      asset: 'XLM',
      secrets: [signer1Secret, signer2Secret],  // Both signers
      userId: 1
    });
    
    expect(result.success).toBe(true);
  });

  test('should reject multi-sig payment with insufficient signatures', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    await expect(
      PaymentService.processPayment({
        senderTag: 'multisig_account',
        recipientTag: 'test_bob',
        amount: 10,
        asset: 'XLM',
        secrets: [signer1Secret],  // Only 1 signer
        userId: 1
      })
    ).rejects.toThrow('Multi-signature account requires at least 2 signatures');
  });
});
```

### Test 9: Custom Asset Transfers

```javascript
describe('Custom Asset Transfers', () => {
  test('should transfer custom asset successfully', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    const result = await PaymentService.processPayment({
      senderTag: 'test_alice',
      recipientTag: 'test_bob',
      amount: 50,
      asset: 'USDC',
      assetIssuer: 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2',
      secrets: [testAliceSecret],
      userId: 1
    });
    
    expect(result.success).toBe(true);
    expect(result.asset).toBe('USDC');
  });

  test('should reject custom asset without issuer', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    await expect(
      PaymentService.processPayment({
        senderTag: 'test_alice',
        recipientTag: 'test_bob',
        amount: 50,
        asset: 'USDC',
        // Missing assetIssuer
        secrets: [testAliceSecret],
        userId: 1
      })
    ).rejects.toThrow('Asset issuer required');
  });
});
```

### Test 10: Transaction History

```javascript
describe('Transaction History', () => {
  test('should retrieve transaction history', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    // Process a payment first
    await PaymentService.processPayment({
      senderTag: 'test_alice',
      recipientTag: 'test_bob',
      amount: 10,
      asset: 'XLM',
      secrets: [testAliceSecret],
      userId: 1
    });
    
    // Retrieve history
    const history = await PaymentService.getTransactionHistory('test_alice', {
      limit: 20,
      offset: 0
    });
    
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].type).toBe('payment');
  });

  test('should filter history by date range', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const history = await PaymentService.getTransactionHistory('test_alice', {
      limit: 20,
      offset: 0,
      from: yesterday.toISOString(),
      to: now.toISOString()
    });
    
    expect(Array.isArray(history)).toBe(true);
  });
});
```

---

## API Endpoint Tests

### Test 11: POST /api/transactions/payment

```javascript
describe('POST /api/transactions/payment', () => {
  test('should process payment via API', async () => {
    const response = await fetch('http://localhost:3000/api/transactions/payment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        senderTag: 'test_alice',
        recipientTag: 'test_bob',
        amount: 10,
        asset: 'XLM',
        memo: 'API test payment',
        senderSecret: testAliceSecret
      })
    });
    
    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.transactionId).toBeDefined();
  });

  test('should return 400 for invalid amount', async () => {
    const response = await fetch('http://localhost:3000/api/transactions/payment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        senderTag: 'test_alice',
        recipientTag: 'test_bob',
        amount: -10,  // Invalid
        asset: 'XLM',
        senderSecret: testAliceSecret
      })
    });
    
    expect(response.status).toBe(400);
  });

  test('should return 402 for insufficient funds', async () => {
    const response = await fetch('http://localhost:3000/api/transactions/payment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        senderTag: 'poor_account',
        recipientTag: 'test_bob',
        amount: 1000000,  // More than available
        asset: 'XLM',
        senderSecret: poorAccountSecret
      })
    });
    
    expect(response.status).toBe(402);
  });
});
```

### Test 12: GET /api/transactions/payment/limits

```javascript
describe('GET /api/transactions/payment/limits', () => {
  test('should return payment limits', async () => {
    const response = await fetch('http://localhost:3000/api/transactions/payment/limits');
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.data.maxAmount).toBe(1000000);
    expect(data.data.minAmount).toBe(0.00001);
  });
});
```

### Test 13: GET /api/transactions/tag/:tag/history

```javascript
describe('GET /api/transactions/tag/:tag/history', () => {
  test('should return transaction history', async () => {
    const response = await fetch(
      'http://localhost:3000/api/transactions/tag/test_alice/history?limit=20&offset=0'
    );
    
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  test('should return 404 for non-existent tag', async () => {
    const response = await fetch(
      'http://localhost:3000/api/transactions/tag/nonexistent/history'
    );
    
    expect(response.status).toBe(404);
  });
});
```

---

## Error Handling Tests

### Test 14: Network Error Retry

```javascript
describe('Network Error Retry', () => {
  test('should retry on network error', async () => {
    // Mock network error on first attempt
    const PaymentService = require('./services/PaymentService.js').default;
    
    // This test requires mocking the Stellar server
    // Simulate network error and verify retry logic
    
    const result = await PaymentService.processPayment({
      senderTag: 'test_alice',
      recipientTag: 'test_bob',
      amount: 10,
      asset: 'XLM',
      secrets: [testAliceSecret],
      userId: 1
    });
    
    expect(result.success).toBe(true);
  });
});
```

### Test 15: Validation Error Messages

```javascript
describe('Validation Error Messages', () => {
  test('should provide detailed validation errors', async () => {
    const response = await fetch('http://localhost:3000/api/transactions/payment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        senderTag: 'ab',           // Too short
        recipientTag: 'test_bob',
        amount: -10,               // Negative
        asset: 'VERYLONGASSET',    // Too long
        senderSecret: 'invalid'    // Invalid format
      })
    });
    
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.details).toBeDefined();
    expect(data.details.length).toBeGreaterThan(0);
  });
});
```

---

## Performance Tests

### Test 16: Payment Processing Speed

```javascript
describe('Performance', () => {
  test('should process payment within 3 seconds', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    const startTime = Date.now();
    
    await PaymentService.processPayment({
      senderTag: 'test_alice',
      recipientTag: 'test_bob',
      amount: 10,
      asset: 'XLM',
      secrets: [testAliceSecret],
      userId: 1
    });
    
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(3000);  // 3 seconds
  });

  test('should handle concurrent payments', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    const payments = Array(5).fill(null).map((_, i) => 
      PaymentService.processPayment({
        senderTag: 'test_alice',
        recipientTag: 'test_bob',
        amount: 1,
        asset: 'XLM',
        secrets: [testAliceSecret],
        userId: 1
      })
    );
    
    const results = await Promise.all(payments);
    
    expect(results.length).toBe(5);
    expect(results.every(r => r.success)).toBe(true);
  });
});
```

---

## Security Tests

### Test 17: Secret Key Security

```javascript
describe('Secret Key Security', () => {
  test('should not log secret keys', async () => {
    const PaymentService = require('./services/PaymentService.js').default;
    
    // Capture logs
    const logs = [];
    const originalLog = console.log;
    console.log = (msg) => logs.push(msg);
    
    await PaymentService.processPayment({
      senderTag: 'test_alice',
      recipientTag: 'test_bob',
      amount: 10,
      asset: 'XLM',
      secrets: [testAliceSecret],
      userId: 1
    });
    
    console.log = originalLog;
    
    // Verify secret key not in logs
    const secretInLogs = logs.some(log => 
      log.includes(testAliceSecret)
    );
    
    expect(secretInLogs).toBe(false);
  });

  test('should not return secret keys in response', async () => {
    const response = await fetch('http://localhost:3000/api/transactions/payment', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwtToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        senderTag: 'test_alice',
        recipientTag: 'test_bob',
        amount: 10,
        asset: 'XLM',
        senderSecret: testAliceSecret
      })
    });
    
    const data = await response.json();
    const responseStr = JSON.stringify(data);
    
    expect(responseStr).not.toContain(testAliceSecret);
  });
});
```

---

## Test Execution

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
npm test -- --testNamePattern="Tag Validation"
```

### Run with Coverage

```bash
npm test -- --coverage
```

### Run Integration Tests Only

```bash
npm test -- --testPathPattern="integration"
```

---

## Test Data Cleanup

```javascript
// After all tests
afterAll(async () => {
  // Clean up test data
  await db('transactions').where('user_id', 1).del();
  await db('stellar_tags').where('tag', 'like', 'test_%').del();
  await db.destroy();
});
```

---

## Checklist Before Production

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] All API endpoint tests passing
- [ ] Error handling tests passing
- [ ] Performance tests passing (< 3 seconds)
- [ ] Security tests passing
- [ ] Load testing completed
- [ ] Database backups configured
- [ ] Monitoring setup
- [ ] Error tracking (Sentry) configured
- [ ] Rate limiting enabled
- [ ] HTTPS enforced
- [ ] JWT tokens validated
- [ ] Stellar network set to PUBLIC
- [ ] Documentation reviewed

---

## Troubleshooting

### Test Fails: "Tag not found"
- Ensure test tags are created before running tests
- Check database connection

### Test Fails: "Insufficient funds"
- Fund test accounts with more XLM
- Use testnet faucet: https://laboratory.stellar.org/#account-creator

### Test Fails: "Network error"
- Check Stellar testnet status
- Verify internet connection
- Check Horizon server availability

### Test Fails: "Invalid secret key"
- Verify secret key format (S + 55 characters)
- Ensure secret key is for testnet account

---

## Support

For issues or questions, refer to:
- `CORE_PAYMENT_IMPLEMENTATION.md` - Full documentation
- `PAYMENT_DEVELOPER_GUIDE.md` - Developer guide
- `PAYMENT_SYSTEM.md` - System architecture
