# Escrow Contract

Soroban escrow contract supporting deposit, release, refund, and dispute
resolution between a payer, a payee, and an optional arbiter.

## Fuzz Tests for Escrow Operation Sequences

This document describes the deterministic fuzz/property test suite that
exercises escrow operation sequences. The suite lives under
`contracts/escrow/src/test.rs` (unit + property tests) and
`contracts/escrow/tests/fuzz.rs` (local-network integration tests).

### Goals

- Exercise arbitrary sequences of escrow operations (`deposit`, `release`,
  `refund`, `dispute`, `resolve`) against the contract.
- Guarantee deterministic validation: every run is reproducible from a fixed
  seed and a fixed ledger/time fixture.
- Cover authorization, boundary values, resource limits, external-call
  failures, and replay paths.

### Deterministic Fixtures

All fuzz tests must be reproducible. Use the shared fixtures below rather
than wall-clock time or random ledger state.

- **Seed**: each property test takes an explicit `u64` seed. The default
  corpus seeds are `0`, `1`, `u64::MAX`, and a small fixed list of
  hand-picked seeds. Never rely on `rand::thread_rng()`.
- **Ledger/time**: use `env.ledger().with_mut(|l| { l.timestamp = T; l.sequence_number = S; })`
  with constants from `fixtures::ledger_at(seq, ts)`. Time advances only by
  explicit `advance_ledger(&env, delta)` calls inside the test body.
- **Accounts**: `fixtures::payer()`, `fixtures::payee()`, `fixtures::arbiter()`,
  and `fixtures::stranger()` return deterministic `Address` values derived
  from fixed seeds.
- **Amounts**: `fixtures::amounts()` returns the boundary corpus
  `[0, 1, MIN_AMOUNT, MIN_AMOUNT + 1, MAX_AMOUNT - 1, MAX_AMOUNT, MAX_AMOUNT + 1]`.

### Operation Sequence Model

A fuzz case is a `Vec<Op>` where each `Op` is one of:

```rust
pub enum Op {
    Deposit { from: Actor, amount: i128 },
    Release { caller: Actor },
    Refund  { caller: Actor },
    Dispute { caller: Actor },
    Resolve { caller: Actor, to_payee: bool },
    AdvanceLedger { delta: u64 },
}
```

The generator produces sequences of bounded length (`MAX_SEQ_LEN`) and
shrinks failing cases to the minimal prefix that still fails. Shrinking is
required so that a failing seed yields a small, reviewable reproducer.

### Coverage Matrix

| Path | What is asserted |
| --- | --- |
| Success | A valid deposit → release sequence moves funds exactly once and leaves the escrow in `Released`. |
| Boundary | Amounts at `0`, `MIN_AMOUNT`, `MAX_AMOUNT`, and `MAX_AMOUNT + 1`; deadlines at `now`, `now + 1`, and `now - 1`; sequence length at `0`, `1`, and `MAX_SEQ_LEN`. |
| Unauthorized | `release`/`refund`/`resolve` from `stranger()` must fail with `Error::Unauthorized` and must not mutate state. |
| Replay | Re-submitting a previously applied operation (same nonce/sequence) must fail with `Error::Replay` and leave balances unchanged. |
| External-call failure | A mocked token transfer that returns an error must abort the operation and roll back all state changes. |
| Resource limits | Sequences that exceed `MAX_SEQ_LEN` or the configured CPU/memory budget must fail with `Error::ResourceLimit` rather than panic. |

### Invariants

Every fuzz case asserts the following invariants after each operation:

1. `payer_balance + payee_balance + escrow_balance` is conserved.
2. The escrow state machine only moves along legal transitions
   (`Created → Funded → Released | Refunded | Disputed → Resolved`).
3. A terminal state (`Released`, `Refunded`, `Resolved`) is absorbing: no
   further operation may change balances.
4. No operation succeeds without the required authorization.

### Running the Suite

```sh
# Unit + property tests (deterministic, no network)
cargo test -p escrow --features testutils

# Local-network integration fuzz tests
cargo test -p escrow --test fuzz -- --nocapture
```

To reproduce a specific failure, pass the reported seed:

```sh
FUZZ_SEED=<seed> cargo test -p escrow --test fuzz
```

### Migration Notes

- The fuzz suite targets the Soroban migration of the escrow contract. When
  migrating from the legacy contract, keep the `Op` enum and fixtures in
  sync with the new entry points so sequences remain valid.
- New entry points must be added to `Op` and to the coverage matrix above;
  a fuzz suite that silently skips an entry point is considered incomplete.
- Storage layout changes must be reflected in the invariant checks; if a
  balance moves to a new key, update invariant (1) accordingly.

### Indexing and Monitoring

- Emitted events (`deposit`, `release`, `refund`, `dispute`, `resolve`) are
  the source of truth for off-chain indexing. Fuzz tests assert that exactly
  one event is emitted per successful operation and none for failed ones.
- Monitoring should alert on `Error::Replay` and `Error::ResourceLimit`
  spikes, which indicate either a client bug or an attempted abuse.

### Rollback Behavior

- Any failed operation (unauthorized, replay, external-call failure,
  resource limit) must leave the contract state byte-for-byte identical to
  the pre-operation state. Fuzz tests assert this by snapshotting the
  relevant storage entries before and after each failing operation.
- If a fuzz case reveals a partial state mutation on failure, that is a
  contract bug and must be fixed before the suite is considered green.
