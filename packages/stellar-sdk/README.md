# @taggedpay/stellar-sdk

TypeScript/JavaScript client library for easy integration with the TaggedPay Stellar API.

## Installation

```bash
npm install @taggedpay/stellar-sdk
```

Or with yarn:

```bash
yarn add @taggedpay/stellar-sdk
```

## Quick Start

```typescript
import { TaggedPayStellar } from '@taggedpay/stellar-sdk';

const client = new TaggedPayStellar({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.taggedpay.xyz'
});

// Create an account
await client.accounts.create({ tag: 'john_lagos', stellarAddress: 'GABCD...' });

// Send a payment
await client.payments.send({ to: '@jane', amount: 100, balanceId: 1 });

// Get balances
const balances = await client.balances.get();
```

## Configuration

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | **required** | Your API key for authentication |
| `baseUrl` | `string` | `https://api.taggedpay.xyz` | Base URL for the API |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `retries` | `number` | `3` | Number of retries for failed requests |
| `retryDelay` | `number` | `1000` | Initial delay between retries (ms) |
| `retryBackoffMultiplier` | `number` | `2` | Multiplier for exponential backoff |

### Example with all options

```typescript
const client = new TaggedPayStellar({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.taggedpay.xyz',
  timeout: 60000,
  retries: 5,
  retryDelay: 500,
  retryBackoffMultiplier: 2
});
```

## API Reference

### Accounts

Manage tags and Stellar addresses.

#### Create an account

```typescript
const account = await client.accounts.create({
  tag: 'john_lagos',
  stellarAddress: 'GABCDEF...'
});
```

#### Get account by tag

```typescript
const account = await client.accounts.get('john_lagos');
// or with @ prefix
const account = await client.accounts.get('@john_lagos');
```

#### Transfer tag ownership

```typescript
await client.accounts.transfer('john_lagos', {
  newStellarAddress: 'GXYZ...'
});
```

#### Check if tag exists

```typescript
const exists = await client.accounts.exists('john_lagos');
```

#### Resolve tag to address

```typescript
const address = await client.accounts.resolve('john_lagos');
```

### Payments

Send funds to tags or wallet addresses.

#### Send to a tag

```typescript
const result = await client.payments.send({
  to: '@jane',
  amount: 100,
  balanceId: 1
});
```

#### Send to a wallet address

```typescript
const result = await client.payments.sendToWallet({
  address: 'GABCDEF...',
  amount: 50,
  balanceId: 1
});
```

### Balances

Manage and view account balances.

#### Get user's balances

```typescript
const balances = await client.balances.get();
```

#### Get balance by ID

```typescript
const balance = await client.balances.getById(1);
```

#### List all balances with pagination

```typescript
const { data, pagination } = await client.balances.list({
  limit: 10,
  offset: 0
});

// pagination contains: { total, limit, offset, hasMore }
```

#### Sync on-chain balances

```typescript
const balances = await client.balances.sync();
```

### Transactions

View transaction history.

#### List user's transactions

```typescript
const transactions = await client.transactions.list();
```

#### Get transaction by ID

```typescript
const transaction = await client.transactions.getById('tx123');
```

#### Get transactions by tag with filters

```typescript
const { data, pagination } = await client.transactions.getByTag('john_lagos', {
  limit: 10,
  offset: 0,
  type: 'transfer',
  from: '2024-01-01',
  to: '2024-12-31',
  sortBy: 'timestamp',
  sortOrder: 'desc'
});

// pagination contains: { total, limit, offset, hasMore }
```

## Error Handling

The SDK provides detailed error classes for different error scenarios:

```typescript
import {
  TaggedPayError,
  ApiError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  ConfigurationError
} from '@taggedpay/stellar-sdk';

try {
  await client.accounts.get('nonexistent');
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('Account not found');
  } else if (error instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
  } else if (error instanceof ValidationError) {
    console.log('Validation errors:', error.errors);
  } else if (error instanceof NetworkError) {
    console.log('Network error occurred');
  } else if (error instanceof TimeoutError) {
    console.log('Request timed out');
  } else if (error instanceof ApiError) {
    console.log(`API error: ${error.message} (${error.statusCode})`);
  }
}
```

### Error Properties

All errors extend `TaggedPayError` with these properties:

| Property | Type | Description |
|----------|------|-------------|
| `message` | `string` | Human-readable error message |
| `code` | `string` | Error code (e.g., `API_ERROR`, `NOT_FOUND`) |
| `statusCode` | `number` | HTTP status code (if applicable) |
| `details` | `object` | Additional error details |

## TypeScript Support

The SDK is written in TypeScript and exports all types:

```typescript
import type {
  Account,
  Balance,
  Transaction,
  PaymentResult,
  PaginationOptions
} from '@taggedpay/stellar-sdk';

// Use types in your code
async function getBalance(): Promise<Balance[]> {
  return client.balances.get();
}
```

## Retry Behavior

The SDK automatically retries failed requests for:

- Network errors
- Timeout errors
- Rate limit errors (429) - honors `Retry-After` header when provided
- Server errors (5xx)

For rate limit errors, the SDK uses the server-provided `retryAfter` value. For other retryable errors, exponential backoff is used.

Client errors (4xx except 429) are not retried.

## License

MIT
