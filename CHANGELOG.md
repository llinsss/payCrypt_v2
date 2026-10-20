# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- Contract pause and recovery operational runbook (issue #1003).
- Deterministic contract event topic conventions for the Rust/Soroban
  migration: every emitted event now uses a stable, typed topic layout so
  off-chain indexers can subscribe and decode events without guessing. Each
  event carries a fixed `(event_name, subject)` topic pair where `event_name`
  is a compile-time `Symbol` constant (e.g. `payment_bounds_updated`,
  `upgrade_proposed`) and `subject` is the affected account/asset identifier;
  topic ordering is fixed (name first, subject second) and never varies by
  call site. Topic symbols are validated deterministically against the same
  bounded ASCII subset used for tags, so malformed or non-ASCII names are
  rejected before emission rather than producing divergent topics. Event data
  payloads remain unchanged, so existing consumers keep working; only the
  topic layout is now guaranteed. Storage growth is unchanged (topics are not
  persisted) and per-invocation work is O(1). Includes focused tests for
  success, boundary (empty subject / max-length symbol), unauthorized, replay,
  and failure paths, plus documentation of migration, indexing, monitoring,
  and rollback behavior (#802).
- Configurable minimum and maximum payment amounts: the contract stores an
  admin-managed `(min_amount, max_amount)` bound pair in instance storage and
  validates every payment amount against it deterministically before any funds
  move. Amounts below the configured minimum or above the configured maximum
  are rejected with the new `PaymentError::AmountBelowMinimum` (13) /
  `PaymentError::AmountAboveMaximum` (14) errors and no state mutation; the
  exact boundary values (amount == min, amount == max) are accepted. Bounds are
  updated only by the authorized admin via `set_payment_bounds`, which rejects
  inverted ranges (`min > max`) with `PaymentError::InvalidBounds` (15) and
  emits a `payment_bounds_updated` event carrying the previous and new bounds
  for indexing. Storage growth is constant (two `i128` fields in instance
  storage) and per-invocation validation work is O(1). Defaults are
  `min = 0` and `max = i128::MAX`, so existing behavior is preserved on
  upgrade; rollback restores the prior bounds by re-invoking
  `set_payment_bounds` with the values from the last event. Includes focused
  tests for success, boundary (exact min/max), unauthorized, replay, and
  failure paths (#801).
- Upgrade proposal expiry: every upgrade proposal now carries a fixed, bounded
  validity window (`PROPOSAL_EXPIRY_SECS`, 30 days). Once the window elapses
  (`ledger.timestamp() >= expires_at`) the proposal can no longer be approved
  or executed, returning the new `UpgradeError::ProposalExpired` (12) with no
  state mutation; previously executed versions and cancelled proposals are
  unaffected, and an approved-but-never-executed proposal cannot be revived
  via rollback once expired. The window is recorded on each proposal in
  `UpgradeRecord::expires_at` and exposed via `proposal_expiry_secs()`, keeping
  storage growth per proposal constant (one `u64` field) and per-invocation
  work bounded. Includes focused tests for success, authorization, exact-boundary
  (one second before/at/after expiry), and failure cases, plus documentation of
  the new error code and expiry semantics. No event schema changes; the rollback
  event payload is unchanged (#979).
- Upgrade manager implementation validation: `authorize_implementation` now rejects empty (all-zero) or malformed WASM hashes before adding them to the allowlist, returning the new `UpgradeError::InvalidImplementation` (11) error code with no state mutation. Includes focused tests for success, authorization, boundary (single non-zero byte), and failure cases, plus documentation of the new error code and behavior in doc comments (#976).
- Wallet destination allowlist enforcement: every withdrawal route now checks
  the recipient against an admin-managed allowlist before funds move, so no
  route can bypass the restriction. Allowlist entries are added/removed only by
  the authorized admin, and an empty allowlist rejects all withdrawals. Includes
  focused tests for success, authorization failure, boundary (empty allowlist /
  exact-match), and invalid recipient cases, plus documentation of externally
  visible behavior, error codes, and event changes (#969).
- Wallet daily withdrawal limits: usage is tracked per ledger day with bounded
  storage, and cumulative per-day accounting prevents split withdrawals from
  bypassing the configured cap. Includes focused tests for success,
  authorization, boundary, and failure cases, plus documentation of externally
  visible behavior, error codes, and event changes (#968).
- Local-network authorization integration tests for the Rust/Soroban migration,
  covering success, boundary, unauthorized, replay, and external-call failure
  paths with deterministic ledger/time fixtures (#830).
- Rust SDK domain types for payment amounts (`Amount`, `Asset`, `PaymentIntent`)
  with deterministic validation, serialization/compatibility behavior, and
  actionable error classification (validation, unauthorized, replay, failure),
  plus unit/property/local-network tests covering success, boundary,
  unauthorized, replay, and failure paths (#834).
- Rust SDK contract discovery manifest (`ContractManifest`, `ContractEntry`,
  `ContractKind`) with typed APIs for serialization, compatibility checks,
  cancellation, and actionable error classification, plus deterministic
  validation and unit/property/local-network tests covering success, boundary,
  unauthorized, replay, and failure paths. Includes migration, indexing,
  monitoring, and rollback documentation (#842).
- Local-network upgrade integration tests for the Rust/Soroban migration (#829).
  - Typed upgrade-flow fixtures with deterministic ledger sequence and timestamp
    values so local-network runs are reproducible.
  - Success, boundary, unauthorized, replay, and external-call failure paths are
    exercised against a local Soroban network.
  - Coverage for authorization checks, boundary values (e.g. zero/max upgrade
    amounts and ledger bounds), resource limits, and external-call f
- Shared tag name normalization conformance vectors covering Unicode
  normalization, whitespace handling, case folding, and rejected confusables,
  run against the Rust/Soroban tag contract behavior (#946).

### Security
- Circuit breaker inspection and reset endpoints are now restricted to
  authenticated admins, resets are rate-limited, and successful resets are
  written to the audit log (#553).
- Documented tag normalization security assumptions (#955): the accepted Unicode
  subset, the normalization form applied, the confusable/skeleton policy, and
  the compatibility implications for clients.
- Explicit checked arithmetic policy for version counters and amount
  accounting (#1007). State version bumps in the `tag` contract and event
  version bumps in `tag_registry` now use checked addition: at `u32::MAX` the
  operation fails with the new `TagError::VersionOverflow` (6) or
  `RegistryError::VersionOverflow` (7) instead of saturating or wrapping, so a
  version is never reused or silently stalled. Payment cancellation computes the
  remaining refundable amount with checked subtraction and returns
  `PaymentError::RefundExceedsFunded` if refunded exceeds funded. Existing error
  codes are unchanged; no event payloads change. Storage growth and
  per-invocation work are unchanged.

### Documentation
- Contract pause and recovery operational runbook (#1003).
  - **Pause authority.** Pausing and unpausing are gated by the contract's admin authority. The admin address is set at initialization and is the only principal permitted to invoke the pause/unpause entrypoints; each call requires the admin's authorization (Soroban `require_auth`). Where the deployment uses a multisig or governance contract as the admin, the same authorization requirement applies and the multisig's own threshold rules govern who can trigger a pause. There is no separate "pauser" role: pause authority is exactly the admin authority.
  - **Monitoring signals.** Operators should watch for the pause/unpause events emitted on state transitions, the paused state flag exposed by the contract's read-only getter, and the contract's error codes returned when an operation is rejected because the contract is paused. A spike in paused-rejection errors, or an unexpected pause event, indicates a pause is in effect and should trigger the recovery procedure below.
  - **Recovery / unpause procedure.** (1) Confirm the pause is intentional and identify the triggering condition. (2) Verify the root cause is resolved and any off-chain dependencies are healthy. (3) Have the admin (or multisig quorum) submit the unpause transaction. (4) Verify the paused state flag reads as unpaused and that a representative operation succeeds. (5) Confirm the unpause event was emitted and monitor for regressions.
  - **Limits of emergency controls.** Pause only blocks new state-changing invocations that check the paused flag. It does not cancel or revert transactions already in flight or already executed, does not affect already-settled state, does not stop off-chain services or indexers, and does not prevent read-only queries. Pause is a circuit breaker, not a rollback mechanism.
- Contract event topic conventions (#802).
  - **Migration.** Topics are additive and deterministic: the `(event_name,
    subject)` layout is fixed at compile time, so no data migration is needed.
    Indexers that previously matched on event data should switch to matching on
    the `event_name` topic symbol; data payloads are unchanged.
  - **Indexing.** Subscribe by the `event_name` topic (first topic) and use the
    `subject` topic (second topic) to scope to an account/asset. Because topic
    ordering and symbols are stable, indexers can build deterministic keys
    without inspecting payloads.
  - **Monitoring.** Alert on unexpected or missing `event_name` symbols; a
    divergence indicates a contract version mismatch rather than a data issue.
  - **Rollback.** Reverting to a prior contract version restores its prior
    topic layout; since payloads are unchanged, indexers only need to re-point
    their topic filters. No stored state is affected by the topic convention.
- Tag normalization security assumptions (#955).
  - **Accepted Unicode subset.** Tags are restricted to a bounded, explicitly
    enumerated subset of Unicode rather than accepting arbitrary codepoints.
    Permitted: ASCII letters (`A-Z`, `a-z`), ASCII digits (`0-9`), and the
    separator characters `-` and `_`. Rejected: all other codepoints, including
    non-ASCII scripts, combining marks, control characters, whitespace, and
    bidirectional/invisible formatting characters. Rejection is deterministic
    and returns the tag-validation error rather than silently stripping input.
  - **Normalization form.** Tags are normalized to Unicode NFC (Canonical
    Decomposition followed by Canonical Composition) before validation and
    storage. Normalization occurs once, at the contract entry point, before any
    comparison, uniqueness check, or persistence, so the stored form and the
    compared form are always identical. Because the accepted subset is ASCII,
    NFC is a no-op for valid tags; it exists to make rejection of non-ASCII
    input deterministic and to keep the pipeline stable if the subset is ever
    widened.
  - **Confusable/skeleton policy.** After normalization, each tag is reduced to
    a confusable skeleton and compared against existing tags. Tags whose
    skeletons collide with an already-registered tag are rejected as
    confusable. This prevents homoglyph and look-alike tags (for example, tags
    that differ only by visually similar characters) from being registered as
    distinct identities. The policy is conservative: it rejects on collision
    rather than attempting to disambiguate, keeping the check bounded and
    deterministic.
  - **Compatibility implications for clients.** Clients MUST send tags in the
    accepted subset and SHOULD pre-normalize to NFC before submission; the
    contract normalizes again defensively, so pre-normalized input is
    idempotent. Clients MUST NOT rely on the contract to strip or repair
    invalid input — invalid tags are rejected, not coerced. Clients that
    previously sent non-ASCII or
