[![Backend CI](https://github.com/llinsss/payCrypt_v2/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/llinsss/payCrypt_v2/actions/workflows/backend-ci.yml)
[![Flutter CI](https://github.com/llinsss/payCrypt_v2/actions/workflows/flutter-ci.yml/badge.svg)](https://github.com/llinsss/payCrypt_v2/actions/workflows/flutter-ci.yml)
[![Docker Build](https://github.com/llinsss/payCrypt_v2/actions/workflows/docker-build.yml/badge.svg)](https://github.com/llinsss/payCrypt_v2/actions/workflows/docker-build.yml)

Welcome to Tagged. A Seamless Crypto Payments solution for Africa.
Imagine sending money to your friend in Lagos as easily as sending a WhatsApp message. Right now, if you want to send crypto to someone, you need to copy and paste a 42-character wallet address that looks like this: 0x028add5d29f4aa3e4144ba1a85d509de6719e58cabe42cc72f58f46c6a84a785. One wrong character? Your money disappears forever. Tagged changes everything. Instead of that nightmare, you simply send to @john or @sarah_lagos. That's it. No more copying addresses, no more fear of losing funds, no more barriers to digital payments

Here's what makes Tagged revolutionary for Africa: 
1. @Tag Payments - Replace 42-character addresses with simple tags like @yourname 
2. Instant Fiat Conversion - Receive crypto, instantly when crypto is sent to you.
3. Multi-Chain Support - Works across Ethereum, Base, Starknet, and Core networks 
4. One-Click Bank Withdrawals - Move funds to your bank account in seconds 
5. KYC Compliant - Fully regulated and secure for legal transactions The African crypto market is exploding - Nigeria alone processes over $400M in crypto monthly. But adoption is stuck because crypto is too complex for everyday people.

Tagged makes crypto as simple as mobile money, but with global reach and lower fees. We're not just building a payment app - we're building the financial infrastructure that will connect Africa to the global digital economy. The future of money is here. It just needed to speak our language.

 Tech Stack 
 Frontend: Next.js / React 
 Backend: Node.js / Express 
 Blockchain: Starknet,Solidity 
 Database: PostgreSQL 
 Payments: Paystack, Monnify 
 Auth: OAuth 2.0 + KYC provider

## Soroban Authorization & Threat Model

This section documents the contract-level threat model for the Soroban (Stellar) payment contracts. It maps every privileged action to the authority that may perform it, records the assumptions the model relies on, lists out-of-scope cases, and links each invariant to the test that enforces it.

### Auth Contexts

Soroban authorization is expressed through `require_auth` on the address that must approve an invocation. The contracts use two contexts:

- **Direct auth** — the caller signs the invocation directly (`address.require_auth()` inside the entrypoint). Used for user-initiated actions such as `send_payment`, `withdraw`, and `set_tag`.
- **Delegated / cross-contract auth** — a contract invokes another contract on behalf of a user. The user's authorization is carried in the `SorobanAuthorizationEntry` and re-checked by the callee via `require_auth`. Used by the router/batch entrypoints that fan out to per-token transfers.

### Privileged Actions → Authority

| Privileged action | Authority | Enforcement |
|-------------------|-----------|-------------|
| `send_payment(from, to, amount)` | `from` address | `from.require_auth()` in entrypoint |
| `batch_payment(from, recipients)` | `from` address | `from.require_auth()` once, reused for all legs |
| `withdraw(owner, amount)` | `owner` address | `owner.require_auth()` |
| `set_tag(owner, tag)` | `owner` address | `owner.require_auth()`; tag uniqueness checked |
| `set_admin(new_admin)` | current admin | `admin.require_auth()` + stored admin equality |
| `pause()` / `unpause()` | admin | `admin.require_auth()` + stored admin equality |
| `upgrade(new_wasm_hash)` | admin | `admin.require_auth()` + stored admin equality |
| Token `transfer` / `transfer_from` | token holder / approved spender | token contract's own `require_auth` + allowance |

### Cross-Contract Calls

- The payment router calls the token contract's `transfer` for each leg. The router never holds user funds between calls; it forwards the exact `amount` and reverts the whole invocation on any leg failure.
- Authorization entries are scoped to the specific invocation (contract id, function, args). A signature valid for one leg is not reusable for a different leg or a different contract.
- The router does not grant itself any allowance; it relies on the user's signed authorization for the exact transfer arguments.

### Admin Power

- The admin can pause/unpause, upgrade the contract, and rotate the admin key. The admin **cannot** move user funds, mint balances, or bypass `require_auth` on user entrypoints.
- Admin rotation is a two-step handoff: the current admin authorizes `set_admin`, and the new admin must be a valid address. There is no timelock in the current version (see Out of Scope).

### Token Behavior

- The contracts assume a standard SEP-41 / Stellar Asset Contract token: `transfer` is atomic, returns `()` on success, and panics on insufficient balance or missing auth.
- Fee-on-transfer and rebasing tokens are **not** supported; the router credits the exact `amount` it sends.
- Token decimals are read from the token contract and are not assumed to be 7.

### Replay

- Soroban authorization entries include a nonce and an expiration ledger. The contracts reject entries whose nonce has already been consumed and whose `live_until_ledger` has passed.
- Because each entry is bound to the exact invocation (contract, function, args), a captured signature cannot be replayed against a different call or a different amount.

### Upgrades

- Upgrades replace the contract WASM via `upgrade(new_wasm_hash)` and require admin auth. Storage layout is preserved across upgrades; migrations must be additive.
- The upgrade entrypoint is the only path that can change contract logic; there is no self-destruct.

### Assumptions

- The Stellar network's ledger close time and auth-entry expiration are honored by the host.
- The admin key is held in a secure signer and is not compromised.
- Token contracts used are well-behaved SEP-41 tokens without transfer hooks that re-enter the payment contract.
- Off-chain tag resolution (backend) is trusted only for display; on-chain `set_tag` is the source of truth for tag ownership.

### Out of Scope

- Compromise of the admin signing key.
- Malicious or non-standard token contracts (fee-on-transfer, rebasing, reentrant hooks).
- Frontend/backend auth (JWT, API keys) — covered by the API security docs.
- Economic attacks on tag squatting and gas/ledger-fee griefing.
- Timelock / multi-sig governance for admin actions (not implemented in this version).

### Invariants → Tests

| Invariant | Test |
|-----------|------|
| Only `from` can authorize `send_payment` | `test_send_payment_requires_from_auth` |
| Batch legs all use the same authorized `from` | `test_batch_payment_single_auth` |
| Only `owner` can `withdraw` | `test_withdraw_requires_owner_auth` |
| Tag is unique and owned by `owner` | `test_set_tag_uniqueness` |
| Only admin can pause/unpause/upgrade | `test_admin_only_entrypoints` |
| Admin cannot move user funds | `test_admin_cannot_transfer_user_funds` |
| Replayed auth entry is rejected | `test_replay_auth_entry_rejected` |
| Expired auth entry is rejected | `test_expired_auth_entry_rejected` |
| Failed leg reverts the whole batch | `test_batch_payment_atomic_revert` |
| Upgrade preserves storage layout | `test_upgrade_preserves_storage` |

## API Documentation

- **Interactive API Docs (Redoc):** [docs/api/](docs/api/) — Browse the full API reference online
- **OpenAPI Spec (JSON):** `GET /api/docs-json` — Fetch the OpenAPI 3.0 spec programmatically (rate-limited, no auth required)
- **Postman Collection:** [docs/Tagged_API.postman_collection.json](docs/Tagged_API.postman_collection.json) — Import into Postman to start testing all endpoints immediately
- **Getting Started Guide:** [docs/api/getting-started.md](docs/api/getting-started.md) — Step-by-step walkthrough: register → get JWT → create wallet → send payment
- **Swagger UI (internal):** `/api-docs` — Protected admin-only Swagger UI (requires basic auth)

Tagged is currently deployed on testnest on the following chains. 

flow - Flow Sepolia
Deployer: 0x09c5096AD92A3eb3b83165a4d177a53D3D754197
Deployed to: 0xEc38bc9Be954b1b95501167A443b5cc81E6e3975
Transaction hash: 0x5f1eedeb5720078c0ebfd300101770eeb99ab982fa4c418b1daee6f3f5d89bf8

Base: BASE Sepolia
Deployer: 0x4246a99Db07C10fCE03ab238f68E5003AC5264a1
Deployed to: 0xD45839223f4B50a113Deba22a7e11Aab7B4C9F7d
Transaction hash: 0x520d169be28dd6b7e27da1f827a8bef49c02af1de9af7a766136c3535dc4fe9c

LISK SEPOLIA
Deployer: 0x09c5096AD92A3eb3b83165a4d177a53D3D754197
Deployed to: 0xEc38bc9Be954b1b95501167A443b5cc81E6e3975
Transaction hash: 0xbb7dad98a7ab7d3d7af0bdebe5d642e11513dc049b5ddaf71d53220784df6a9e

STARKNET: 0x028add5d29f4aa3e4144ba1a85d509de6719e58cabe42cc72f58f46c6a84a785

currently testing on these chains and will be going on mainnet soon

Demo Instructions

simply visit https://taggedpay.xyz/
sign up, do kyc (we accept dummy data for now)
then explore the product.

  
  Prerequisites

Node.js 18+ installed
MySQL database running
Git installed

Quick Setup

 1. Clone & Install
   bash
git clone https://github.com/llinsss/payCrypt_v2.git
cd payCrypt_v2
npm install
cd backend && npm install && cd 


2. Database Setup
  bash
cd backend
cp .env.example .env
 Edit .env with your MySQL credentials
npm run migrate


 3. Start Application
  bash
  Terminal 1: Backend
cd backend && npm run dev

  Terminal 2: Frontend  
npm run dev


API Key Scopes

API keys enforce scope-based authorization. When creating an API key via POST /api-keys, specify required scopes as a comma-separated string.

**Available Scopes:**

| Scope | Description | Routes |
|-------|-------------|--------|
| `transactions:read` | Read transaction history and details | GET /transactions, GET /transactions/:id, GET /transactions/tag/:tag |
| `transactions:write` | Create, update, delete transactions | PUT /transactions/:id, DELETE /transactions/:id, POST /transactions/payment |
| `payments:send` | Send payments and batch payments | POST /transactions/payment, POST /transactions/batches |
| `webhooks:read` | List and retrieve webhook configurations | GET /webhooks, GET /webhooks/:id, GET /webhooks/:id/deliveries |
| `webhooks:write` | Create, update, delete webhooks | POST /webhooks, PUT /webhooks/:id, DELETE /webhooks/:id, POST /webhooks/:id/rotate-secret |

**Example: Create API Key with Read-Only Access**
```bash
curl -X POST http://localhost:3000/api-keys \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Read-only API Key",
    "scopes": "transactions:read,webhooks:read"
  }'
```

**Using API Key with Scopes**
```bash
curl -X GET http://localhost:3000/transactions \
  -H "x-api-key: <API_KEY>"
```

If the API key lacks required scope, you'll receive:
```json
{
  "error": "API key does not have required scope(s): transactions:write",
  "required_scopes": ["transactions:write"]
}
```

Deep Linking for Payment Requests (Mobile App)

The mobile app supports deep linking for payment requests, allowing users to open the app directly with payment details pre-filled.

**Supported Deep Link Formats:**

1. **Web URL (Android App Links + iOS Universal Links):**
   ```
   https://taggedpay.xyz/pay/@recipient_tag
   https://taggedpay.xyz/pay/@recipient_tag?amount=50&token=USDC&memo=rent
   ```

2. **Custom Scheme (iOS):**
   ```
   tagg://pay/@recipient_tag?amount=50&token=USDC
   ```

**Query Parameters:**

| Parameter | Description | Example |
|-----------|-------------|---------|
| `amount` | Payment amount (optional) | `?amount=50` |
| `token` | Token/currency (optional) | `?token=USDC` |
| `memo` | Transaction memo (optional) | `?memo=rent` |

**Examples:**

- Basic payment request: `https://taggedpay.xyz/pay/@alice`
- With amount: `https://taggedpay.xyz/pay/@alice?amount=100`
- Full details: `https://taggedpay.xyz/pay/@alice?amount=50&token=USDC&memo=Monthly+rent`

**How it works:**

1. User taps a payment link (web, chat, email, etc.)
2. If Tagg is not installed, browser redirects to app store (fallback)
3. If Tagg is installed:
   - App opens to sign-in if user is not authenticated
   - App opens to send flow with recipient pre-filled if user is logged in
   - Optional amount and token fields are pre-filled if provided

**Generating Shareable Payment Links:**

Users can generate shareable payment request links from the Deposit screen:
```
https://taggedpay.xyz/pay/@your_tag
```

These links can be shared via:
- QR code (built into Deposit screen)
- Direct URL sharing
- Chat/messaging apps
- Email

**Android Configuration:**

Deep linking is configured via intent-filters in `AndroidManifest.xml`. The app declares support for:
- `https://taggedpay.xyz/pay/*`

**iOS Configuration:**

Deep linking is configured via URL schemes in `Info.plist`:
- URL scheme: `tagg://pay/@tag`
- Universal Links: `https://taggedpay.xyz/pay/*` (requires `apple-app-site-association`)

 Demo Flow

 Access Points
- Frontend: http://localhost:5173
- Backend: http://localhost:3000

 Demo Steps

1. Register Account
