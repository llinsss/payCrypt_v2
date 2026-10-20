# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Soroban TTL renewal design for persistent payment state (#773):
  - Typed persistent storage schema for payment records with TTL metadata
    (`last_renewed_ledger`, `ttl_extension_ledgers`) and deterministic
    validation of renewal thresholds.
  - `renew_payment_ttl` entry point that extends persistent entry TTL via
    `env.storage().persistent().extend_ttl` using bounded, deterministic
    thresholds.
  - Authorization enforcement on renewal calls via `require_auth` on the
    payment owner, rejecting unauthorized callers.
  - Unit/property/local-network tests covering success, boundary,
    unauthorized, replay, and failure paths.
  - Documentation of migration, indexing, monitoring, and rollback behavior
    for the TTL renewal feature.
