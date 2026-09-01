# Chain and Token Input Schemas

Closes issues [#562](../../issues/562) and [#563](../../issues/563).

## Problem

`createChain`, `updateChain`, `createToken`, and `updateToken` forwarded
`req.body` directly to the model layer with no whitelisting. Any field
present in the request body — including undocumented, sensitive, or
future columns — was written to the database.

## Solution

Explicit Joi schemas whitelist the permitted fields for each operation.
The `validate` middleware applies these schemas on the route before the
controller runs. Unknown fields are stripped; missing required fields
return 422.

---

## Chain schemas (`backend/validators/chainSchemas.js`)

### `createChainSchema` — required fields

| Field       | Type    | Rules |
|-------------|---------|-------|
| `name`      | string  | 1–100 chars, required |
| `chainId`   | string  | lowercase letters, digits, hyphens; 1–64 chars, required |
| `rpcUrl`    | string  | valid HTTP/HTTPS/WS/WSS URL, max 512 chars, optional |
| `symbol`    | string  | 1–12 uppercase alphanumeric, optional |
| `is_active` | boolean | defaults to `true` |
| `network`   | string  | one of the supported chain types, optional |

### `updateChainSchema` — all fields optional, at least one required

Same field rules as above; at least one field must be supplied or a 422
is returned.

---

## Token schemas (`backend/validators/tokenSchemas.js`)

### `createTokenSchema` — required fields

| Field             | Type    | Rules |
|-------------------|---------|-------|
| `symbol`          | string  | 1–20 uppercase alphanumeric, required |
| `name`            | string  | 1–100 chars, required |
| `decimals`        | integer | 0–36, required |
| `chain`           | string  | one of the supported chain types, required |
| `contractAddress` | string  | valid EVM/Stellar/Lisk address format, optional |
| `is_active`       | boolean | defaults to `true` |
| `logoUrl`         | string  | valid HTTP/HTTPS URL, max 512 chars, optional |

### `updateTokenSchema` — all fields optional, at least one required

Same field rules as above; at least one field must be supplied.

---

## validate middleware (`backend/middleware/validate.js`)

```js
validate(schema, property = "body")
```

- Validates `req[property]` against `schema`
- On failure: returns **422** with `{ success: false, error, details[] }`
- On success: writes the validated (coerced + stripped) value back to
  `req[property]` so controllers receive clean data

---

## Error response shape (422)

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    { "field": "symbol", "message": "symbol is required" },
    { "field": "unknownField", "message": "unknownField is not allowed" }
  ]
}
```

---

## Files changed

| File | Change |
|------|--------|
| `backend/validators/chainSchemas.js` | New — create/update schemas for chains |
| `backend/validators/tokenSchemas.js` | New — create/update schemas for tokens |
| `backend/middleware/validate.js` | New — generic Joi validation middleware |
| `backend/routes/chains.js` | POST/PUT now use `validate(createChainSchema)` / `validate(updateChainSchema)` |
| `backend/routes/tokens.js` | POST/PUT now use `validate(createTokenSchema)` / `validate(updateTokenSchema)` |
| `backend/controllers/chainController.js` | Uses `req.body` directly (already validated) |
| `backend/controllers/tokenController.js` | Uses `req.body` directly (already validated) |

## Tests

`backend/tests/chainController.test.js` and `backend/tests/tokenController.test.js`
verify that:

- Controllers pass `req.body` as-is to the model (no re-injection of dropped fields)
- 404 is returned for unknown resource IDs
- Model errors surface as 500