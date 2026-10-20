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

- Rust/Soroban payment contract interface (#774):
  - Typed storage layout separating instance config (`admin`, `schema_version`)
    from persistent payment records, with explicit TTL metadata and
    deterministic key derivation.
  - Authorization model using `require_auth` for payment owners plus an
    admin-gated role check for privileged operations, with signer validation
    and replay protection via per-payment nonces.
  - Contract events (`payment_created`, `payment_settled`, `payment_refunded`,
    `payment_ttl_renewed`) with stable topic tuples and typed data payloads
    covering the full payment lifecycle.
  - Typed error enum for deterministic failure reporting across validation,
    authorization, replay, and resource-limit paths.
  - Resource-limit and upgrade-compatibility notes: bounded TTL extension,
    schema-versioned storage migration, and rollback behavior.
  - Unit/property/local-network tests covering success, boundary,
    unauthorized, replay, and failure paths for the payment interface.
  - Documentation of migration, indexing, monitoring, and rollback behavior
    for the payment contract interface.
