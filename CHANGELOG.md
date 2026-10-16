# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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

### Security
- Circuit breaker inspection and reset endpoints are now restricted to
  authenticated admins, resets are rate-limited, and successful resets are
  written to the audit log (#553).

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
