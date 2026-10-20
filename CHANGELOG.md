# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Anti-spam deposits for public tag addresses in the Rust/Soroban contracts (#811).
  - Typed `TagDepositConfig` (asset, base amount, per-address minimum) with deterministic
    validation: non-negative amounts, supported asset, and bounded configuration values.
  - Trust boundary: only the contract admin may set or update deposit configuration;
    unauthorized callers are rejected before any state mutation.
  - Privileged roles: admin configures deposits; tag owners may not alter deposit terms.
  - Replay-safe/idempotent deposit handling keyed by a unique deposit id so duplicate
    submissions do not double-charge or double-credit.
  - Failure-safe state transitions: validation and authorization run before writes, so a
    failed deposit leaves balances and tag state unchanged (no partial state).
  - Tests covering success, boundary amounts, unauthorized callers, replay, and failure paths.

### Migration / Indexing / Monitoring / Rollback

- Migration: existing public tags default to a zero deposit until the admin sets a
  configuration; no data backfill is required.
- Indexing: emit a `deposit` event (tag address, asset, amount, deposit id) for off-chain
  indexers; idempotent ids let indexers deduplicate replays.
- Monitoring: alert on repeated unauthorized config attempts and on deposit-id collisions.
- Rollback: disabling deposits is a config change (set amount to zero); no state migration
  is needed to revert.
