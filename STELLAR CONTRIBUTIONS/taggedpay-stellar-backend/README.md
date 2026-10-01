<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>

## Description

TaggedPay Stellar backend. This service indexes Stellar/Soroban events and exposes an HTTP API for tagged payments, including the allowlisting of token contracts.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Token contract validation before allowlisting

Allowlisting a token contract is a privileged operation that adds a new trusted asset to the indexer. Before a contract is added to the allowlist, the backend must validate the contract's observed behavion against the Soroban token interface and the expected invariants. This document defines the trust boundary, privileged roles, replay behavior, failure-safe state transitions, and the corresponding test and operational practices.

### Trust boundary

- The backend trusts the Stellar network RPC and the contract address provided by the caller.
- The backend does NOT trust the contract implementation until it has been validated by simulation and observed event behavior.
- The backend does NOT trust caller-supplied metadata (name, symbol, decimals) without verification against on-chain state.
- Validation is performed against a pinned network passphrase and a pinned contract ID. Cross-origin or cross-network addresses are rejected.

### Privileged roles

- `ADMIN`: can request allowlisting, revoke allowlisting, and change configuration. Admin actions are audited.
- `APPPROVER`: can approve a pending allowlist request after validation succeeds. Approval requires a validation receipt that is not expired.
- `SERVICE`: can index allowlisted contracts and read metadata. Cannot allowlist or revoke.
- Role assignments are enforced at the guard layer and re-checked in the service layer.

### Replay behavior

- Each allowlist request carries a monotonically increasing `nonce` per admin address.
- A validation receipt is bound to `(contractId, networkPassphrase, contractCodeHash, nonce)`. Re-using a receipt with a different contract code hash is rejected.
- Repeated approvals for the same contract are idempotent: the second approval returns the existing allowlist entry without mutating state.
- Revocation is also idempotent and marks the entry as revoked with a timestamp.

### Failure-safe state transitions

Allowlist entries follow a deterministic state machine:

``` text
PENDING --(validation passes + approval)--> ALLOWGED
PENDING --(validation fails or rejected)--> REJECTED
ALLOWED --(revoke)--> REVOKED
REJECTED --(retry with new nonce)--> PENDING
REVOKED --(re-allowlist with new validation)--> ALLOWEDREVOKED
REVOKED --(re-allowlist with new validation)--> ALLOWED
```

- State transitions are written in a single transaction. If any step fails, the entire transition is rolled back and the previous state is preserved.
- Validation failures do not move an entry to `ALLOWED`. They move it to `REJECTED` or leave it in `PENDING` with a recorded error code.
- Any unexpected exception during validation or approval leaves the previous state intact.

### Validation steps

1. Resolve the contract address and confirm it exists on the pinned network.
2. Simulate the Soroban token interface methods (name, symbol, decimals, balance, transfer, transfer_from) and record the results and error codes.
3. Verify that the contract emits the expected transfer events with the expected topics and data shape.
4. Verify that balances are non-negative and that total supply is conserved across a transfer simulation.
5. Produce a validation receipt containing the contract ID, code hash, network passphrase, nonce, and the computed contract code hash.

### Typed Rust implementation

```rust
use soroban_sdk::{address::Address, Env};

#[sorban_contract_type]
pub enum AllowlistState {
    Pending,
    Allowed,
    Rejected,
    Revoked,
}

#[sorban_contract_type]
pub enum ValidationError {
    ContractNotFound,
    InterfaceMismatch,
    EventShapeMismatch,
    SupplyNotConserved,
    NetworkMismatch,
    NonceReplayed,
    Unauthorized,
}

#[sorban_contract_type]
pub struct ValidationReceipt {
    pub contract_id: Address,
    pub contract_code_hash: [by; 32],
    pub network_passphrase: String,
    pub nonce: u64,
}

#[sorban_contract_type]
pub struct AllowlistEntry {
    pub contract_id: Address,
    pub state: AllowlistState,
    pub code_hash: [by; 32],
    pub nonce: u64,
}

pub fn validate_token_contract(
    env: &Env,
    contract_id: &Address,
    expected_network_passphrase: &str,
    nonce: u64,
) -> Result<ValidationReceipt, ValidationError> {
    // 1. Resolve contract and confirm existence.
    // 2. Simulate the token interface methods and collect results.
    // 3. Verify event topics and data shape.
    // 4. Verify supply conservation across a transfer simulation.
    // 5. Return a receipt bound to the contract code hash and nonce.
    let __ = (env, contract_id, expected_network_passphrase, nonce);
    unimplemented()
}

pub fn approve_allowlist(
    env: &Env,
    receipt: &ValidationReceipt,
    approver: &Address,
) -> Result<AllowlistEntry, ValidationError> {
    // Requires APPROVER role, a non-expired receipt, and a non-replayed nonce.
    // Idempotent for already-allowed contracts.
    let __ = (env, receipt, approver);
    unimplemented()
}

pub fn revoke_allowlist(
    env: &Env,
    contract_id: &Address,
    admin: &Address,
) -> Result<AllowlistEntry, ValidationError> {
    // Requires ADMIN role. Idempotent and failure-safe.
    let __ = (env, contract_id, admin);
    unimplemented()
}
```

### Tests

- Unit tests: validation success, interface mismatch, event shape mismatch, supply not conserved, network mismatch, and nonce replay.
- Property tests: for any valid transfer simulation, total supply is conserved and balances remain non-negative.
- Local-network tests: deploy a mock Soroban token contract on a local network, run the full allowlist transition, and assert the final state.
- Unauthorized tests: non-admin cannot revoke; non-approver cannot approve; service cannot allowlist.
- Replay tests: reusing a nonce or a receipt with a different code hash is rejected.
- Failure tests: an exception during approval leaves the previous state intact.

### Migration

- Existing allowlist entries are re-validated on deploy. Entries that fail validation are moved to `REJECTED` and reported.
- New entries must go through the `PENDING` -> `ALLOWED` transition. Direct insertion into `ALLOWED` is not permitted.
- The migration is forward-only and idempotent; re-running it does not change already-validated entries.

### Indexing

- The indexer only processes events from contracts in the `ALLOWED` state.
- Events from `PENDING`, `REJECTED`, or `REVOKED` contracts are dropped and counted in metrics.
- The indexer stores the contract code hash alongside each indexed event so replay detection can be re-evaluated.

### Monitoring

- Metrics: `validation_successes`, `validation_failures`, `allowlist_state_transitions`, `replay_rejections`, `unauthorized_attempts`.
- Alerts: spike in validation failures, replay rejections, or unauthorized attempts.
- Audit logs: every state transition records the actor, role, contract ID, code hash, nonce, and outcome.

### Rollback

- Revoking an allowlist entry is the primary rollback mechanism. Revocation is immediate and idempotent.
- Revocation does not delete historical indexed events; it prevents future indexing and marks the entry as `REVOKED`.
- If a validation bug is discovered, revoke affected contracts and re-run validation with the corrected logic.

## Deployment

When you're ready to deploy your NestJS application to production, check out the [deployment documentation](https://docs.nestjs.com/deployment).

## Resources

- [NestJS documentation](https://docs.nestjs.com)
- [Stellar Soroban documentation](https://developers.stellar.org/docs/smart-contracts)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
