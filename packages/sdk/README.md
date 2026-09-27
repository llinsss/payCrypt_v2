# @tagged/sdk

**Official JavaScript/TypeScript SDK for the Tagged API.**  
Seamlessly integrate Tagged crypto payments into your Node.js or browser application.

> Send a payment in 5 lines of code:
> ```ts
> import { TaggedSDK } from '@tagged/sdk';
> const tagged = new TaggedSDK();
> await tagged.auth.login({ email: 'user@example.com', password: '...' });
> const tx = await tagged.transactions.send({ recipientTag: '@john', amount: '50', asset: 'XLM' });
> console.log(`Sent! Reference: ${tx.reference}`);
> ```

---

## Installation

```bash
npm install @tagged/sdk
```

## Quickstart

### 1. Initialize the SDK

```ts
import { TaggedSDK } from '@tagged/sdk';

const tagged = new TaggedSDK({
  baseUrl: 'https://paycryptv2-production.up.railway.app/api',
  timeout: 30000,
});
```

### 2. Authenticate

```ts
// Login
const { token, user } = await tagged.auth.login({
  email: 'user@example.com',
  password: 'your-password',
});

// Or register a new account
const { token, user } = await tagged.auth.register({
  email: 'newuser@example.com',
  password: 'secure-password',
  tag: '@john_lagos',
  fullName: 'John Doe',
});
```

### 3. Send a Payment

```ts
const transaction = await tagged.transactions.send({
  recipientTag: '@sarah_lagos',
  amount: '25.50',
  asset: 'XLM',
  memo: 'Thanks for lunch!',
});

console.log(`Sent! Reference: ${transaction.reference}`);
```

### 4. Check Balances

```ts
const { balances, totalUsdValue } = await tagged.balances.get();
balances.forEach(b => {
  console.log(`${b.tokenSymbol}: ${b.balance} ($${b.usdValue})`);
});
```

### 5. List Transactions

```ts
const { transactions, pagination } = await tagged.transactions.list({
  type: 'debit',
  limit: 10,
});

transactions.forEach(tx => {
  console.log(`[${tx.status}] ${tx.amount} ${tx.tokenSymbol} -> @${tx.recipientTag}`);
});
```

---

## API Reference

### `TaggedSDK(config?)`

| Option      | Type     | Default                                                                 | Description                  |
|-------------|----------|-------------------------------------------------------------------------|------------------------------|
| `baseUrl`   | `string` | `https://paycryptv2-production.up.railway.app/api` | Tagged API base URL          |
| `apiKey`    | `string` | `undefined`                                                             | API key for server-to-server |
| `timeout`   | `number` | `30000`                                                                 | Request timeout (ms)         |

### `.auth`

| Method                                | Description                  |
|---------------------------------------|------------------------------|
| `.login({ email, password })`         | Login and get JWT token      |
| `.register({ email, password, tag })` | Register a new account       |
| `.getProfile()`                       | Get current user's profile   |
| `.setToken(token)`                    | Manually set the auth token  |

### `.transactions`

| Method                                              | Description                       |
|-----------------------------------------------------|-----------------------------------|
| `.send({ recipientTag, amount, asset })`            | Send payment to a @tag            |
| `.list({ type?, status?, limit?, offset? })`        | List transactions with filters    |
| `.get(id)`                                          | Get a single transaction by ID    |
| `.createScheduled({ recipientTag, amount, ... })`   | Schedule a recurring payment      |
| `.listScheduled({ status?, limit?, offset? })`      | List scheduled payments           |
| `.cancelScheduled(id)`                              | Cancel a scheduled payment        |

### `.balances`

| Method          | Description                                |
|-----------------|--------------------------------------------|
| `.get()`        | Get all balances for the authenticated user |

### `.tags`

| Method           | Description                        |
|------------------|------------------------------------|
| `.resolve(tag)`  | Check if a @tag exists and get info |
| `.getMyTag()`    | Get your own tag info              |

### `.webhooks`

| Method                              | Description              |
|-------------------------------------|--------------------------|
| `.create({ url, events })`          | Create a webhook         |
| `.list()`                           | List all webhooks        |
| `.get(id)`                          | Get webhook by ID        |
| `.update(id, data)`                 | Update webhook config    |
| `.delete(id)`                       | Delete a webhook         |

---

## Automatic JWT Refresh

Configure a refresh handler for transparent token renewal on 401 responses:

```ts
tagged.setRefreshTokenHandler(async () => {
  const response = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!response.ok) return null;
  const { token } = await response.json();
  return token;
});
```

### Features:
- **Single-Flight Deduplication**: Multiple concurrent requests encountering `401 Unauthorized` share a single in-flight refresh promise, preventing duplicate token refresh requests to your authentication server.
- **Retry Loop Prevention**: Requests are marked internally and retried at most once. If a retried request still returns `401` (e.g., revoked or invalid refreshed credentials), it immediately fails with `AuthenticationError` without re-entering the refresh cycle.
- **Error Preservation**: Original authentication error messages and details are preserved if token refresh fails or returns `null`.

---

## Error Handling

All errors extend `TaggedError`:

```ts
import { AuthenticationError, RateLimitError, ValidationError } from '@tagged/sdk';

try {
  await tagged.transactions.send({ ... });
} catch (error) {
  if (error instanceof AuthenticationError) {
    // Redirect to login
  } else if (error instanceof ValidationError) {
    console.error('Validation failed:', error.details);
  } else if (error instanceof RateLimitError) {
    console.warn(`Rate limited. Retry after ${error.retryAfter}s`);
  }
}
```

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Type-check
npm run typecheck
```

---

## License

MIT © Tagged
