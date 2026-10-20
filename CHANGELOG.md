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
