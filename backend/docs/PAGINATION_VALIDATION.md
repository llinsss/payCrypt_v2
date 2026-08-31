# Pagination Validation

Closes issues [#560](../../issues/560) and [#561](../../issues/561).

## Problem

`chainController.js` and `tokenController.js` previously destructured `page`
and `limit` directly from `req.query` and passed them straight to `parseInt`
and arithmetic before any bounds check. This meant:

- `page=0` or `page=-5` produced a negative offset sent to Knex
- `limit=99999` caused runaway full-table scans
- `page=abc` (`NaN`) caused `NaN` offsets reaching the database

## Solution

A shared Joi schema (`backend/validators/paginationValidator.js`) is applied to
`req.query` by the `validate` middleware on every list route **before** the
controller runs. The controller receives clean, coerced integers.

### Schema rules

| Parameter | Type    | Min | Max    | Default |
|-----------|---------|-----|--------|---------|
| `page`    | integer | 1   | 10 000 | 1       |
| `limit`   | integer | 1   | 100    | 10      |

Any value outside these bounds — including `0`, negative numbers, `NaN`,
non-integers, and values above the cap — is rejected with **422 Unprocessable
Entity** before it reaches the database.

### Error response shape (422)

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    { "field": "limit", "message": "limit must not exceed 100" }
  ]
}
```

## Files changed

| File | Change |
|------|--------|
| `backend/validators/paginationValidator.js` | New — shared Joi schema |
| `backend/middleware/validate.js` | New — generic validation middleware |
| `backend/routes/chains.js` | `GET /` now uses `validate(paginationSchema, "query")` |
| `backend/routes/tokens.js` | `GET /` now uses `validate(paginationSchema, "query")` |
| `backend/controllers/chainController.js` | Reads pre-validated integers from `req.query` |
| `backend/controllers/tokenController.js` | Reads pre-validated integers from `req.query` |

## Tests

`backend/tests/chainController.test.js` and `backend/tests/tokenController.test.js`
cover:

- Default values produce correct offsets
- Correct offset arithmetic for non-default page/limit combinations
- Maximum allowed values (limit=100, page=10000)
- 500 propagation when the model throws