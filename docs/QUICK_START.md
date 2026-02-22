# Payment System - Quick Start (5 Minutes)

## 1. Setup Database

```bash
npm run migrate
npm run seed
```

## 2. Create Test Tags

```javascript
import TagService from './services/TagService.js';

await TagService.createTag('alice', 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2');
await TagService.createTag('bob', 'GBUQWP3BOUZX34ULNQG23RQ6F4BFSRJsu6I5VPH6PYXF3P27TFBULGL2');
```

## 3. Start Server

```bash
npm start
```

## 4. Process Payment

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
    "senderSecret": "SXXXXXXX..."
  }'
```

## 5. Check Limits

```bash
curl http://localhost:3000/api/transactions/payment/limits
```

## 6. Get History

```bash
curl "http://localhost:3000/api/transactions/tag/alice/history?limit=20"
```

---

## Key Files

| File | Purpose |
|------|---------|
| `services/PaymentService.js` | Core payment logic |
| `services/TagService.js` | Tag resolution |
| `models/Transaction.js` | Transaction storage |
| `controllers/transactionController.js` | HTTP endpoints |
| `schemas/payment.js` | Validation schemas |
| `routes/transactions.js` | Route definitions |

---

## Common Tasks

### Process Payment
```javascript
import PaymentService from './services/PaymentService.js';

const result = await PaymentService.processPayment({
  senderTag: 'alice',
  recipientTag: 'bob',
  amount: 100,
  asset: 'XLM',
  secrets: [senderSecret],
  userId: 1
});
```

### Check Balance
```javascript
const balance = await PaymentService.getBalance(address, 'XLM');
```

### Calculate Fee
```javascript
const fee = PaymentService.calculateFee(100, 'XLM');
```

### Get History
```javascript
const history = await PaymentService.getTransactionHistory('alice');
```

---

## Validation Rules

| Field | Rule |
|-------|------|
| Tag | 3-20 alphanumeric + underscore |
| Amount | 0.00001 - 1,000,000 |
| Asset | 1-12 uppercase alphanumeric |
| Memo | Max 28 characters |
| Address | G + 55 alphanumeric |
| Secret | S + 55 alphanumeric |

---

## Error Codes

| Code | Meaning |
|------|---------|
| 201 | Payment successful |
| 400 | Validation failed |
| 402 | Insufficient funds |
| 404 | Tag/account not found |
| 503 | Network error |

---

## Documentation

- **Full Details:** `CORE_PAYMENT_IMPLEMENTATION.md`
- **Developer Guide:** `PAYMENT_DEVELOPER_GUIDE.md`
- **Testing:** `PAYMENT_TESTING_GUIDE.md`
- **Architecture:** `PAYMENT_SYSTEM.md`

---

## Support

For issues, check:
1. Database migrations ran successfully
2. Environment variables configured
3. Stellar network connectivity
4. Test tags created
5. JWT token valid

---

**Ready to go!** 🚀
