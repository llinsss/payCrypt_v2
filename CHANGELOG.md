# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Rust/Soroban: partial-fill policy for payment intents (#781).
  - Typed storage for per-intent fill state (`filled_amount`, `remaining_amount`, `status`) with deterministic validation.
  - Authorization checks on the partial-fill entrypoint (only the intent payer/authorized filler may apply fills).
  - Events emitted on partial-fill application and on completion; typed errors for invalid amount, overfill, unauthorized, and replay cases.
  - Bounded fill operations with checked arithmetic and upgrade-compatible storage layout (append-only keys, versioned schema).
  - Unit/property/local-network tests covering success, boundary, unauthorized, replay, and failure paths.
  - Migration, indexing, monitoring, and rollback notes documented alongside the contract.

- Rust/Soroban: contract pause domains (#796).
  - Typed storage for per-domain pause state (`PauseDomain`, `PausedDomain`, `PauseAdmin`, `PauseSchemaVersion`) with deterministic validation of domain identifiers.
  - Authorization checks on `pause`/`unpause` entrypoints: only the configured pause admin may transition state; unauthorized callers receive a typed `Unauthorized` error.
  - Structured Soroban events (`pause_set`, `pause_cleared`) emitted on every state transition, plus a typed `PauseError` enum for invalid domain, unauthorized, already-paused, not-paused, and replay cases.
  - Resource limits: bounded domain set (`MAX_PAUSE_DOMAINS`) and bounded domain identifier length (`MAX_DOMAIN_LEN`) enforced on every write.
  - Upgrade compatibility: append-only storage keys and a versioned pause schema so future domains can be added without migrating existing entries.
  - Unit/property/local-network tests covering success, boundary, unauthorized, replay, and failure paths.
  - Migration, indexing, monitoring, and rollback behavior documented alongside the contract.
