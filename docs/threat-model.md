# Soroban Authorization & Threat Model

This document is the contract-level threat model for the Soroban contracts in this
repository. It covers authorization contexts, cross-contract calls, admin power,
token behavior, replay, and upgrades. Every invariant is linked to the test that
enforces it.

## 1. Scope

In scope:

- The Soroban smart contracts under `contracts/` and their entry points.
- Authorization checks performed by those contracts (`require_auth`, custom
  `require_auth_for_args`, and any admin gating).
- Cross-contract calls made by these contracts into tokens or other contracts.
- Upgrade and initialization paths.

Out of scope:

- The Stellar network, Soroban host, and ledger consensus.
- The Stellar Asset Contract (SAC) implementation itself.
- Off-chain clients, indexers, and front-ends.
- Key management and signer custody on the user side.

## 2. Trust Model & Assumptions

- The Soroban host correctly enforces `require_auth` and signature/authorization
  semantics. We assume the host is not malicious.
- Ledger timestamps and sequence numbers are monotonic and trustworthy.
- Token contracts (SAC or otherwise) honor the SEP-41 interface and do not
  re-enter in ways that violate their own invariants.
- Admin keys are held by a trusted operator; compromise of an admin key is a
  privileged-action threat, not a contract bug.
- Contract storage is durable and not externally mutable except through the
  contract's own entry points.

## 3. Privileged Actions → Authority

| Privileged action | Authority required | Enforcement |
| --- | --- | --- |
| Initialize contract / set admin | Deployer (one-time) | `initialize` guarded against re-init |
| Change admin | Current admin | `require_auth` on admin address |
| Pause / unpause | Admin | `require_auth` on admin address |
| Upgrade contract WASM | Admin | `require_auth` on admin address |
| Withdraw / move funds | Admin or fund owner | `require_auth` on the acting address |
| User-initiated state change | The user's own address | `require_auth` on the user address |
| Cross-contract token transfer | The address whose balance moves | `require_auth` on that address |

Any entry point that mutates privileged state MUST call `require_auth` on the
relevant address before mutating storage.

## 4. Threat Analysis

### 4.1 Authorization contexts

- **Threat:** an entry point mutates state without checking the caller's
  authority, or checks the wrong address.
- **Mitigation:** every state-mutating entry point calls `require_auth` (or
  `require_auth_for_args`) on the address whose state changes. Admin-only paths
  check the stored admin address, not a caller-supplied one.
- **Invariant:** *No state mutation occurs without a matching `require_auth` on
the affected address.*
- **Test:** `test_unauthorized_call_panics`, `test_admin_only_paths_require_admin`.

### 4.2 Cross-contract calls

- **Threat:** a malicious callee re-enters or returns unexpected values, or the
  contract trusts a caller-supplied contract address.
- **Mitigation:** token/contract addresses are stored at initialization and never
  taken from untrusted input for privileged operations. State is updated before
  external calls where feasible (checks-effects-interactions).
- **Invariant:** *Privileged external calls target only addresses fixed at
  initialization.*
- **Test:** `test_cross_contract_target_is_pinned`, `test_state_updated_before_external_call`.

### 4.3 Admin power

- **Threat:** admin can unilaterally drain funds, pause indefinitely, or upgrade
  to malicious code.
- **Mitigation:** admin actions are explicit, emit events, and are limited to the
  documented set. Admin transfer is itself an authorized action.
- **Invariant:** *Every admin action emits an event and requires admin auth.*
- **Test:** `test_admin_action_emits_event`, `test_admin_transfer_requires_auth`.

### 4.4 Token behavior

- **Threat:** a token returns `false`/errors on transfer, has non-standard
  decimals, or is malicious.
- **Mitigation:** transfer results are checked; the contract does not assume a
  specific token beyond the SEP-41 interface; amounts are validated against
  balances.
- **Invariant:** *A failed token transfer reverts the whole transaction.*
- **Test:** `test_failed_transfer_reverts`, `test_amount_bounds_checked`.

### 4.5 Replay

- **Threat:** a signed authorization is replayed across transactions or ledgers.
- **Mitigation:** rely on Soroban's built-in authorization expiration and nonce
  semantics; do not implement custom signature schemes. Any custom nonce is
  stored and consumed exactly once.
- **Invariant:** *A given authorization can be consumed at most once.*
- **Test:** `test_authorization_cannot_be_replayed`, `test_nonce_consumed_once`.

### 4.6 Upgrades

- **Threat:** an unauthorized party upgrades the contract, or an upgrade loses
  or corrupts storage.
- **Mitigation:** upgrades require admin auth; storage layout is versioned and
  migrations are explicit.
- **Invariant:** *Only the admin can upgrade, and upgrades preserve storage
  invariants.*
- **Test:** `test_upgrade_requires_admin`, `test_upgrade_preserves_state`.

## 5. Invariant → Test Index

| Invariant | Test |
| --- | --- |
| No mutation without `require_auth` | `test_unauthorized_call_panics` |
| Admin-only paths check admin | `test_admin_only_paths_require_admin` |
| External targets pinned at init | `test_cross_contract_target_is_pinned` |
| Effects before interactions | `test_state_updated_before_external_call` |
| Admin actions emit events | `test_admin_action_emits_event` |
| Admin transfer authorized | `test_admin_transfer_requires_auth` |
| Failed transfer reverts | `test_failed_transfer_reverts` |
| Amount bounds checked | `test_amount_bounds_checked` |
| No authorization replay | `test_authorization_cannot_be_replayed` |
| Nonce consumed once | `test_nonce_consumed_once` |
| Upgrade requires admin | `test_upgrade_requires_admin` |
| Upgrade preserves state | `test_upgrade_preserves_state` |

## 6. Out-of-Scope Cases

- Host or ledger-level compromise.
- Compromise of user or admin private keys.
- Denial-of-service via network congestion or fee spikes.
- Bugs in third-party token contracts that violate SEP-41.
- Off-chain infrastructure (RPC providers, indexers, front-ends).
