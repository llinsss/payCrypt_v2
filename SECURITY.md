# Security Threat Model — Soroban Contracts

This document is the contract-level threat model for the Soroban smart
contracts in this repository. It covers authorization contexts,
cross-contract calls, admin power, token behavior, replay, and upgrades.

Scope: on-chain contract logic and the authorization surface it exposes.
Out of scope: Stellar Core / consensus, the Soroban host implementation,
RPC providers, and off-chain key custody (see "Out of scope" below).

## 1. Trust model and assumptions

- The Soroban host enforces `require_auth` correctly; a contract cannot
  forge an authorization it did not receive.
- Ledger timestamps and sequence numbers are monotonic and provided by the
  host; contracts do not trust caller-supplied time.
- Token contracts referenced by address behave per the SEP-41 / Stellar
  Asset Contract interface (transfer semantics, no reentrancy surprises
  beyond what the host permits).
- Admin keys are held in a secure signer; compromise of an admin key is a
  key-management incident, not a contract bug.
- Contract storage is durable and not directly writable by third parties
  except through contract entry points.

## 2. Privileged actions → authority map

| Privileged action | Authority required | Enforcement |
| --- | --- | --- |
| Initialize contract / set initial admin | Deployer (one-time) | `initialize` guarded against re-init |
| Change admin | Current admin | `require_auth` on stored admin |
| Pause / unpause | Admin | `require_auth` on stored admin |
| Upgrade WASM | Admin | `require_auth` on stored admin |
| Withdraw / move contract-held funds | Admin (or explicit role) | `require_auth` on admin/role |
| User-initiated state change (deposit, claim, etc.) | The affected user | `require_auth` on the user address |
| Cross-contract call into a token | The contract itself | Host auth for the calling contract |

Every entry point that mutates privileged state MUST call `require_auth`
on the mapped authority before any state change.

## 3. Authorization contexts

- **User context**: entry points acting on behalf of a user call
  `address.require_auth()` for that user. The user's signature authorizes
  exactly the invocation arguments; contracts must not treat one user's
  auth as covering another user's funds.
- **Admin context**: admin-only entry points call `require_auth` on the
  stored admin address. Admin auth is never inferred from a user auth.
- **Contract context**: when the contract calls another contract, the host
  attributes the call to this contract's address. Contracts must not assume
  a downstream contract will re-check auth on their behalf.

## 4. Cross-contract calls

- Treat all external contracts as untrusted. Validate return values and do
  not assume a call succeeded without checking the result.
- Perform state updates before external calls where possible
  (checks-effects-interactions) to limit reentrancy impact.
- Do not pass user-controlled addresses as the `from` of a token transfer
  without a corresponding `require_auth` on that address.
- Pin expected token/contract addresses; do not accept arbitrary
  caller-supplied contract IDs for privileged operations.

## 5. Admin power

- Admin can pause, upgrade, and change admin. These are the highest-impact
  powers and are the primary centralization risk.
- Admin cannot move user funds except through explicitly authorized
  withdrawal entry points, which themselves require the relevant auth.
- Admin changes should emit events so off-chain monitors can detect them.

## 6. Token behavior

- The contract assumes SEP-41-compliant tokens: `transfer` moves exactly
  the requested amount or fails; balances are not silently altered.
- Fee-on-transfer or rebasing tokens are **out of scope**; if supported,
  accounting must measure actual received amounts, not requested amounts.
- The contract never assumes a token call is free of side effects.

## 7. Replay and freshness

- Authorization is bound to the specific invocation (entry point +
  arguments) by the host; a signature for one call cannot be replayed for
  a different call.
- Where the contract uses nonces or one-time flags, they are stored in
  persistent storage and checked before use.
- Time- or sequence-dependent logic reads host-provided values, not
  caller-supplied ones.

## 8. Upgrades

- Upgrades require admin auth and replace the WASM while preserving
  storage layout expectations.
- Storage schema changes must be migration-safe; incompatible layout
  changes are a breaking upgrade and must be reviewed.
- An upgrade is a full trust reset: the new code inherits all admin powers.

## 9. Invariants → tests

| Invariant | Test |
| --- | --- |
| Re-initialization is rejected | `test_initialize_twice_fails` |
| Admin-only entry points reject non-admin callers | `test_admin_auth_required` |
| User entry points require the user's auth | `test_user_auth_required` |
| Pause blocks state-changing entry points | `test_paused_blocks_mutations` |
| Upgrade requires admin auth | `test_upgrade_requires_admin` |
| Admin change requires current admin auth | `test_set_admin_requires_auth` |
| Token transfers move the exact requested amount | `test_transfer_amount_exact` |
| Replayed/duplicate operations are rejected | `test_replay_rejected` |

Each invariant above must have a corresponding test in the contract test
suite; adding a new privileged entry point requires adding its auth test.

## 10. Out of scope

- Stellar Core, consensus, and the Soroban host itself.
- Off-chain key management, signer compromise, and phishing.
- RPC/indexer availability and correctness.
- Economic/oracle manipulation outside the contract's own logic.
- Fee-on-transfer, rebasing, or otherwise non-SEP-41 tokens.

## 11. Reporting

Report suspected vulnerabilities privately to the maintainers before public
disclosure. Do not open a public issue for an unpatched vulnerability.
