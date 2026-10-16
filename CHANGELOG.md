# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
    derived from the tag name (lowercased, trimmed, and length-bounded) so that
    equivalent tags resolve to a single storage entry and indexers can key
    events and state by the same canonical form.
  - Version semantics: each tag carries a monotonically increasing version that
    is assigned on write, compared numerically for ordering, and only ever
    advanced (never reused or decremented) so upgrades remain backward
    compatible and replay-safe.
  - Event topics: registry mutations emit events with stable, canonical topics
    (tag key + action) so consumers can filter deterministically without
    inspecting payload internals.
  - Indexer reconstruction: an indexer can rebuild registry state from the event
    stream alone by replaying canonical tag keys and versions in ledger order,
    requiring only the topic schema and version ordering guarantees documented
    here.
  - Storage growth and per-invocation work remain bounded: one canonical entry
    per tag key, constant-size version metadata, and no unbounded scans on the
    write path.
