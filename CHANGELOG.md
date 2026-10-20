# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

### Documentation
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
    previously sent non-ASCII or confusable tags will observe a validation
    failure where they may have previously succeeded, and should update their
    input validation and error handling accordingly. Error codes and events are
    unchanged by this documentation; the externally visible behavior is the
    deterministic rejection described above.

## [1.0.0] - 2024-02-21

### Added

- Local-network upgrade integration tests for the Rust/Soroban migration (#829).
  - Typed upgrade-flow fixtures with deterministic ledger sequence and timestamp
    values so local-network runs are reproducible.
  - Success, boundary, unauthorized, replay, and external-call failure paths are
    exercised against a local Soroban network.
  - Coverage for authorization checks, boundary values (e.g. zero/max upgrade
    amounts and ledger bounds), resource limits, and external-call failures.

### Documentation

- Documented the upgrade migration flow, indexing of upgrade events, monitoring
  signals, and rollback behavior for the local-network integration tests (#829).
- Documented the registry contract's externally visible contracts (#965):
  - Canonical tag keys: tags are stored under a deterministic, normalized key
    derived from the tag name 
