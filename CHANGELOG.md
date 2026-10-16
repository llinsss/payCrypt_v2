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
