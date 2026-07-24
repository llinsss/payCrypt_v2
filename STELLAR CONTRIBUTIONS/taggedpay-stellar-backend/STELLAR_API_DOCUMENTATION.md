# Stellar API Documentation

This document describes the TaggedPay Stellar integration API endpoints for Phase 1.

## Base URL
```
http://localhost:3000/api/v1
```

## Endpoints

### Accounts Management

#### Create New Stellar Account
**Endpoint:** `POST /stellar/accounts`

Creates a new funded Stellar testnet account linked to a @tag.

**Request Body:**
```json
{
  "tag": "john_lagos",
  "initialBalance": 100
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tag": "@john_lagos",
    "publicKey": "GBZXN3XVFC3TTIYVMJ2HAW3E34Z6YIX27N2HQKH3RDXEWWBXVZVMYOMQ",
    "secretKey": "SBQMM4EME...",
    "balance": "50"
  }
}
```

**Status Code:** 201 Created

---

### Tag Management

#### Register @tag to Stellar Address Mapping
**Endpoint:** `POST /stellar/tags`

Registers an @tag to a Stellar public key mapping for tag resolution.

**Request Body:**
```json
{
  "tag": "john_lagos",
  "publicKey": "GBZXN3XVFC3TTIYVMJ2HAW3E34Z6YIX27N2HQKH3RDXEWWBXVZVMYOMQ"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tag": "@john_lagos",
    "publicKey": "GBZXN3XVFC3TTIYVMJ2HAW3E34Z6YIX27N2HQKH3RDXEWWBXVZVMYOMQ",
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Status Code:** 201 Created

---

#### Resolve @tag to Stellar Address
**Endpoint:** `GET /stellar/tags/:tag`

Resolves a @tag to its corresponding Stellar public key for payment routing.

**Parameters:**
- `tag` (string): The @tag identifier (with or without @ prefix)

**Response:**
```json
{
  "success": true,
  "data": {
    "tag": "@john_lagos",
    "publicKey": "GBZXN3XVFC3TTIYVMJ2HAW3E34Z6YIX27N2HQKH3RDXEWWBXVZVMYOMQ"
  }
}
```

**Status Code:** 200 OK

**Error Responses:**
- 404 Not Found: Tag does not exist

---

#### Unregister @tag
**Endpoint:** `DELETE /stellar/tags/:tag`

Removes a @tag from the registry.

**Parameters:**
- `tag` (string): The @tag identifier to unregister

**Response:**
```json
{
  "success": true,
  "message": "Tag @john_lagos unregistered"
}
```

**Status Code:** 200 OK

**Error Responses:**
- 404 Not Found: Tag does not exist

---

### Payments

#### Send Payment Between @tags
**Endpoint:** `POST /stellar/payments`

Sends XLM from one @tag to another using Stellar blockchain.

**Request Body:**
```json
{
  "fromTag": "john_lagos",
  "toTag": "jane_smith",
  "amount": 10.5
}
```

**Response:**
```json
{
  "success": true,
  "hash": "3ce3d5039e734eaa3293b1aaffc8c99d87c9418729ba0b8e9cb979e0c2587aae",
  "from": "@john_lagos",
  "to": "@jane_smith",
  "amount": 10.5
}
```

**Status Code:** 200 OK

**Error Responses:**
- 400 Bad Request: Invalid tag or insufficient balance
- 404 Not Found: Tag does not exist
- 500 Internal Server Error: Network or transaction failure

---

## Tag Format

Tags must follow this format:
- **Length:** 3-30 characters
- **Characters:** Alphanumeric (a-z, 0-9) and underscores (_)
- **Case:** Insensitive (normalized to lowercase)
- **Prefix:** Optional @ symbol (automatically stripped)

**Valid Examples:**
- `john_lagos`
- `@john_lagos`
- `jane_smith_123`
- `@user_2024`

---

## Stellar Public Key Format

Stellar public keys are 56-character strings starting with 'G':
```
GBZXN3XVFC3TTIYVMJ2HAW3E34Z6YIX27N2HQKH3RDXEWWBXVZVMYOMQ
```

---

## Error Handling

All errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Tag @john_lagos is already registered",
  "error": "ConflictException"
}
```

**Common Error Codes:**
- `400 Bad Request`: Invalid input validation
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists
- `500 Internal Server Error`: Server/network error

---

## Testing with cURL

### Register a tag
```bash
curl -X POST http://localhost:3000/api/v1/stellar/tags \
  -H "Content-Type: application/json" \
  -d '{
    "tag": "john_lagos",
    "publicKey": "GBZXN3XVFC3TTIYVMJ2HAW3E34Z6YIX27N2HQKH3RDXEWWBXVZVMYOMQ"
  }'
```

### Resolve a tag
```bash
curl http://localhost:3000/api/v1/stellar/tags/john_lagos
```

### Send payment
```bash
curl -X POST http://localhost:3000/api/v1/stellar/payments \
  -H "Content-Type: application/json" \
  -d '{
    "fromTag": "john_lagos",
    "toTag": "jane_smith",
    "amount": 10.5
  }'
```

---

## Notes

- Testnet uses Friendbot for account funding (5,000 XLM initial balance)
- Mainnet requires manual account funding
- All timestamps are in UTC (ISO 8601 format)
- Tag resolution tracks resolution count for analytics
