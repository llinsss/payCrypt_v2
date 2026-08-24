# Crypto Amount Precision and API Format

## Overview

As of version [1.0.0], the payment API requires amounts to be sent as **decimal strings** instead of JSON numbers. This ensures exact precision for all supported token types, including values that would lose precision as JavaScript numbers (1e16 and above).

## API Change Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Format** | JSON number | Decimal string |
| **Example** | `{"amount": 1000.5}` | `{"amount": "1000.5"}` |
| **Maximum** | Limited by float precision | Full token precision |
| **Risk** | Silent precision loss | Validation error if invalid |

## Why This Change?

JavaScript's IEEE 754 number format cannot safely represent integers larger than 2^53 - 1 (9,007,199,254,740,991). Crypto amounts commonly exceed this threshold:

### Precision Loss Example

```javascript
// ❌ UNSAFE - JSON numbers lose precision
const unsafeAmount = 1000000000000000000; // 1e18
JSON.parse(JSON.stringify({amount: 1e18})); // Precision may be lost

// ✅ SAFE - Decimal strings preserve exact value
const safeAmount = "1000000000000000000";
JSON.parse(JSON.stringify({amount: "1000000000000000000"})); // Exact
```

## API Examples

### Single Payment

#### Request (Updated)

```bash
curl -X POST https://api.tagged.example/api/payment/process \
  -H "Content-Type: application/json" \
  -d '{
    "senderTag": "@alice",
    "recipientTag": "@bob",
    "amount": "1000.50",    # ✅ String format
    "asset": "XLM"
  }'
```

#### Response

```json
{
  "success": true,
  "transactionId": "txn_123456",
  "amountSent": "1000.50",
  "status": "pending"
}
```

### Batch Payment

```bash
curl -X POST https://api.tagged.example/api/payment/batch \
  -H "Content-Type: application/json" \
  -d '{
    "senderTag": "@alice",
    "payments": [
      {
        "recipientTag": "@bob",
        "amount": "100.50"      # ✅ String format
      },
      {
        "recipientTag": "@charlie",
        "amount": "250.75"      # ✅ String format
      }
    ],
    "asset": "USDC"
  }'
```

## Token-Specific Decimal Precision

Each token supports a maximum number of decimal places:

| Token | Decimals | Example | Notes |
|-------|----------|---------|-------|
| **XLM** | 7 | `"1.2345678"` | Stellar Lumens native token |
| **STRK** | 18 | `"1.123456789012345678"` | Starknet token |
| **USDC** | 6 | `"100.123456"` | USD Coin |
| **USDT** | 6 | `"100.123456"` | Tether |
| **ETH** | 18 | `"1.123456789012345678"` | Ethereum |
| **LSK** | 18 | `"1.123456789012345678"` | Lisk |
| **FLOW** | 18 | `"1.123456789012345678"` | Flow |
| **U2U** | 18 | `"1.123456789012345678"` | U2U Network |

### Decimal Validation

The API enforces token-specific decimal precision:

```javascript
// ✅ VALID - XLM supports 7 decimals
POST /api/payment/process
{
  "amount": "1.2345678",    // 7 decimals = OK
  "asset": "XLM"
}

// ❌ INVALID - XLM rejects 8+ decimals
POST /api/payment/process
{
  "amount": "1.12345678",   // 8 decimals = ERROR
  "asset": "XLM"
}

// Error: "XLM supports maximum 7 decimal places. Received 8 decimal places in: "1.12345678""
```

## Migration Guide

### For Client Implementations

#### JavaScript / Node.js

```javascript
// ❌ Before (UNSAFE for large amounts)
const amount = 1000.50;
await api.payment.send({amount});

// ✅ After (SAFE, exact precision)
const amount = "1000.50";
await api.payment.send({amount});

// For amounts calculated from cents or smallest units:
const cents = 100050;
const amount = (cents / 100).toString();  // "1000.50"
```

#### Python

```python
# ❌ Before (UNSAFE)
amount = 1000.50
response = requests.post(url, json={"amount": amount})

# ✅ After (SAFE)
from decimal import Decimal
amount = str(Decimal("1000.50"))  # "1000.50"
response = requests.post(url, json={"amount": amount})
```

#### HTTP/REST Clients

```json
{
  "amount": "1000.50"
}
```

## Error Messages and Handling

### Unsafe Numeric Amount

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Amount must be a string to preserve precision for large values. " +
             "Example: send \"1000000000000000000\" instead of 1e+18. " +
             "See API documentation for decimal-string format."
}
```

### Invalid Decimal Places

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "XLM supports maximum 7 decimal places. Received 8 decimal places in: \"1.12345678\""
}
```

### Exceeding Token Maximum

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "USDC amount cannot exceed 1000000000000000000. Received: \"10000000000000000000\""
}
```

### Unsupported Token

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Unsupported token: INVALID. Supported tokens: XLM, STRK, LSK, BASE, FLOW, U2U, USDC, USDT"
}
```

## FAQ

**Q: Why strings instead of just fixing JavaScript numbers?**  
A: JavaScript's IEEE 754 format fundamentally cannot represent all large integers exactly. Using strings is the industry-standard solution (see JSON, API design best practices).

**Q: Will my old requests still work?**  
A: No, this is a breaking change. All numeric amounts will be rejected with a clear error. Migration typically requires only changing `1000.50` to `"1000.50"`.

**Q: How do I handle amounts in my backend?**  
A: Accept as string via API, then convert to `BigNumber.js` (already in use in this codebase) for calculations.

**Q: What if I have trailing zeros like "1.50"?**  
A: Both `"1.50"` and `"1.5"` are valid as long as decimal places don't exceed the token limit. The value is semantically identical.

## Implementation Details

### Validation Pipeline

1. **Type Check** — Reject if numeric (any number type)
2. **Format Check** — Validate decimal string pattern (`/^\d+(\.\d+)?$/`)
3. **Token Resolution** — Identify token and get decimal limits
4. **Decimal Places Check** — Verify provided decimals ≤ token max decimals
5. **Range Check** — Ensure amount ≤ token maximum
6. **Positivity Check** — Reject zero and negative values
7. **Conversion** — Convert validated string to `BigNumber` for calculation

### Token Configuration

Token metadata is stored in the database and seeded during initialization. See `backend/utils/demoSeedData.js` for seed examples and `backend/schemas/amountValidation.js` for validation logic.

## References

- [IEEE 754 Floating Point Precision](https://en.wikipedia.org/wiki/Double-precision_floating-point_format)
- [JSON String Format for Amounts](https://tools.ietf.org/html/draft-stanley-json-number-precision-01)
- [BigNumber.js Documentation](https://mikemcl.github.io/bignumber.js/)
