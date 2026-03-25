# Validation Guide

Comprehensive reference for the input validation layer in payCrypt_v2.

---

## Architecture

```
Request
  │
  ├─ app.js global middleware
  │     detectSqlInjection()   ← SQL injection block (403)
  │     sanitizeRequest()      ← XSS strip on all inputs
  │
  ├─ Route-level middleware
  │     validate(schema)       ← req.body validation
  │     validateQuery(schema)  ← req.query validation
  │     validateParams(schema) ← req.params validation
  │     validateRequest({...}) ← body + query + params in one call
  │
  └─ Controller
```

All validators are built with **Joi v17** and share:
- `abortEarly: false` — returns all field errors at once
- `stripUnknown: true` — drops unexpected keys silently
- `convert: true` — coerces query-string numbers/booleans where schema expects them
- Post-validation XSS sanitization via `sanitize-html`

---

## Error Response Format

Every validation failure returns **HTTP 400** with this shape:

```json
{
  "error": true,
  "message": "Validation failed",
  "errors": [
    { "field": "email",    "message": "Please provide a valid email address" },
    { "field": "password", "message": "Password must be at least 8 characters long" }
  ]
}
```

`errors[].field` is the Joi path key (dot-notation for nested objects).

---

## Middleware

### `middleware/validation.js` (existing)

| Export | Validates |
|--------|-----------|
| `validate(schema)` | `req.body` |
| `validateQuery(schema)` | `req.query` |
| `validateParams(schema)` | `req.params` |
| `sanitizeRequest()` | All inputs (XSS strip, no schema) |
| `detectSqlInjection()` | All inputs (blocks 403) |

### `middleware/validateRequest.js` (new)

Unified middleware that validates body, query, and params in a single call, collecting errors from all three sources before responding.

```js
import { validateRequest } from "../middleware/validateRequest.js";

router.put("/:id",
  validateRequest({
    params: numericIdParamSchema,
    body:   walletUpdateSchema,
  }),
  handler
);
```

---

## Reusable Field Builders

### `validators/customValidators.js`

| Export | Description |
|--------|-------------|
| `tagField()` | `@tag`: 3–20 alphanumeric + underscore |
| `registrationTagField()` | `@tag` up to 50 chars (registration only) |
| `cryptoAmountField()` | Positive number, up to 18 decimal places |
| `nonNegativeAmountField()` | `>= 0` number |
| `paginationLimitField()` | Integer 1–100, default 20 |
| `paginationOffsetField()` | Integer >= 0, default 0 |
| `integerIdField()` | Positive integer ID |
| `numericIdParamSchema` | Joi object `{ id: integerIdField() }` for `:id` params |
| `isoDateField()` | ISO 8601 date string, allows null/"" |
| `dateRangeValidator` | Custom validator ensuring start <= end |
| `nameField(min, max)` | Trimmed string name |
| `urlField()` | http/https URI |
| `strongPasswordField()` | 8+ chars, upper+lower+digit+special |
| `twoFactorTokenField()` | 6–32 alphanumeric chars |
| `assetSymbolField()` | 1–12 uppercase alphanumeric (e.g. `ETH`) |

### `validators/blockchainValidators.js`

| Export | Description |
|--------|-------------|
| `SUPPORTED_CHAINS` | `["starknet","base","flow","lisk","u2u","evm","stellar"]` |
| `blockchainAddressField(chain)` | Chain-specific address pattern field |
| `genericBlockchainAddress()` | Length-only guard (10–130 chars) |
| `stellarSecretKey()` | `S` + 55 base32 uppercase chars |
| `addressWithChainSchema` | Joi object validating `{ address, chain }` together |

#### Chain Address Formats

| Chain | Pattern | Example |
|-------|---------|---------|
| `evm` / `base` / `u2u` | `0x` + 40 hex | `0xAbCd...1234` |
| `starknet` | `0x` + 1–64 hex | `0x049d36...dc7` |
| `flow` | `0x` + 16 hex | `0x1234567890abcdef` |
| `lisk` | `lsk` + 38 base32 | `lskabcde...` |
| `stellar` | `G` + 55 base32 | `GAAZI4TCR3...` |

---

## Schemas

### Auth (`schemas/auth.js`)

| Schema | Endpoint | Key Rules |
|--------|----------|-----------|
| `authSchemas.register` | `POST /auth/register` | tag (3–50), email, strong password |
| `authSchemas.login` | `POST /auth/login` | email, password (any) |
| `authSchemas.twoFactorToken` | `POST /auth/2fa/*` | 6–32 alphanumeric token |

### Transactions (`schemas/transaction.js`)

| Schema | Used By | Key Rules |
|--------|---------|-----------|
| `transactionQuerySchema` | `GET /transactions` | pagination, date range, type, sortBy/sortOrder |
| `transactionSearchQuerySchema` | `GET /transactions/search` | adds `q` keyword + `status` filter |
| `transactionIdParamSchema` | `GET/PUT/DELETE /transactions/:id` | numeric positive integer |
| `transactionTagParamSchema` | `GET /transactions/tag/:tag` | 3–20 alphanumeric |
| `transactionSchema` | `PUT /transactions/:id` | partial update, at least one field |

### Wallets (`schemas/wallet.js`)

| Schema | Endpoint | Key Rules |
|--------|----------|-----------|
| `sendToTagSchema` | `POST /wallets/send-to-tag` | receiver_tag (3–20), crypto amount, balance_id |
| `sendToWalletSchema` | `POST /wallets/send-to-wallet` | receiver_address (10–130 chars), crypto amount, balance_id |
| `walletUpdateSchema` | `PUT /wallets/:id` | name, notes, is_default, label — at least one |

### Balances (`schemas/balance.js`)

| Schema | Endpoint | Key Rules |
|--------|----------|-----------|
| `balanceCreateSchema` | `POST /balances` | token, symbol (1–12 uppercase), chain (enum), non-negative amounts |
| `balanceUpdateSchema` | `PUT /balances/:id` | partial update — amount, usd_value, address, auto_convert_threshold |

### KYC (`schemas/kyc.js`)

| Schema | Endpoint | Key Rules |
|--------|----------|-----------|
| `kycCreateSchema` | `POST /kycs` | all required, dob must be 18+, id_type enum, http/https URLs |
| `kycUpdateSchema` | `PUT /kycs/:id` | all optional, same rules, at least one field |

### Payments (`schemas/payment.js`)

| Schema | Endpoint | Key Rules |
|--------|----------|-----------|
| `processPaymentSchema` | `POST /transactions/payment` | Stellar tags, amount, Stellar secret key, optional memo ≤ 28 chars |

### Disputes (`schemas/dispute.js`)

| Schema | Endpoint | Key Rules |
|--------|----------|-----------|
| `createDisputeSchema` | `POST /disputes` | transaction_id, reason ≤ 255, category enum, priority default medium |
| `disputeQuerySchema` | `GET /disputes` | pagination, status/priority/category filters |
| `updateDisputeStatusSchema` | `PATCH /disputes/:id/status` | status enum, optional resolution_note |
| `escalateDisputeSchema` | `POST /disputes/:id/escalate` | reason 10–1000 chars |
| `addCommentSchema` | `POST /disputes/:id/comments` | comment 1–2000 chars |
| `assignDisputeSchema` | `PATCH /disputes/:id/assign` | integer admin_id |

### Exports (`schemas/export.js`)

| Schema | Endpoint | Key Rules |
|--------|----------|-----------|
| `exportRequestSchema` | `POST /exports/request` | format (csv/pdf), date range, amount range cross-validation |
| `exportStatusSchema` | `GET /exports/status/:jobId` | non-empty jobId |
| `exportDownloadSchema` | `GET /exports/download/:fileName` | non-empty fileName |

### Scheduled Payments (`schemas/scheduledPayment.js`)

| Schema | Endpoint | Key Rules |
|--------|----------|-----------|
| `createScheduledPaymentSchema` | `POST /scheduled-payments` | recipientTag, amount, scheduledAt must be future and within 30 days |
| `scheduledPaymentQuerySchema` | `GET /scheduled-payments` | pagination, status filter |

---

## Adding Validation to a New Endpoint

1. **Define a schema** in the appropriate `schemas/` file, using field builders from `validators/customValidators.js` where applicable.

2. **Apply middleware** in the route:

```js
// Body validation
router.post("/", authenticate, validate(myCreateSchema), handler);

// Query validation
router.get("/", authenticate, validateQuery(myQuerySchema), handler);

// Param validation
router.get("/:id", authenticate, validateParams(numericIdParamSchema), handler);

// Combined (body + params)
router.put("/:id",
  authenticate,
  validateRequest({ params: numericIdParamSchema, body: myUpdateSchema }),
  handler
);
```

3. **Write tests** in `tests/validation.enhanced.test.js` (or a new test file) following the pattern:
   - One test for empty/missing required fields → expect 400
   - One test for each invalid field value → check `res.body.errors` field names
   - One test for a fully valid payload → expect 200

---

## Sanitization

All validated values are passed through `sanitize-html` with no allowed tags or attributes, stripping any HTML/script content before the controller sees the data. This is applied automatically by all `validate*` middleware functions.

The global `sanitizeRequest()` middleware in `app.js` provides a second pass before route handlers are reached.
