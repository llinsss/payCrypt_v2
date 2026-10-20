# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- **Multi-asset escrow isolation (#779):** Soroban payments contract now keeps
  escrow state isolated per asset. Each escrow records its own asset identifier,
  amount, depositor, beneficiary, and lifecycle status, so balances and state for
  one asset can never leak into another. Includes:
  - Typed `Escrow` storage keyed by `(asset, escrow_id)` with deterministic
    validation of asset identifiers, amounts, and lifecycle transitions.
  - Authorization checks so only the depositor may create/refund and only the
    beneficiary (or depositor) may release an isolated escrow.
  - Events emitted for escrow creation, release, refund, and asset isolation
    changes.
  - Unit/property/local-network tests covering success, boundary, unauthorized,
    replay, and failure paths.

### Migration & operations

- **Migration:** Existing single-asset escrow entries are migrated to the new
  per-asset key space on first access; no manual data migration is required.
  The contract version is bumped and older entries remain readable during the
  upgrade window.
- **Indexing:** Off-chain indexers should key escrow records by
  `(asset, escrow_id)` and consume the new escrow events (`escrow_created`,
  `escrow_released`, `escrow_refunded`, `escrow_asset_isolated`).
- **Monitoring:** Alert on repeated unauthorized escrow attempts and on any
  escrow event whose asset does not match the stored escrow asset.
- **Rollback:** Reverting to the previous contract version is safe because the
  per-asset keys are additive; legacy single-asset reads continue to work until
  the new entries are drained.
