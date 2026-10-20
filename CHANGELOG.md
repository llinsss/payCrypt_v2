# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Rust/Soroban registry: prevent tag squatting (#810).
  - **Typed validation:** tag registration is validated deterministically before any state is written — tag format/normalization, ownership, and reservation checks are enforced by typed Rust logic rather than ad-hoc string handling.
  - **Trust boundary & privileged roles:** the registry defines who may register, reserve, transfer, and release a tag. Registration is restricted to the authenticated owner of the tag; reservation and administrative transfer/release require an explicit privileged role. Unauthorized callers are rejected before state mutation.
  - **Replay behavior:** duplicate or replayed registration/transfer operations are handled idempotently — a replay of an already-applied operation is a no-op that returns the existing state instead of creating a conflicting owner.
  - **Failure-safe transitions:** tag ownership changes are applied atomically; a partial or failed operation cannot leave inconsistent tag ownership, and failed transitions roll back to the prior consistent state.
  - **Tests:** unit/property/local-network coverage for success, boundary, unauthorized, replay, and failure paths.
  - **Docs:** migration, indexing, monitoring, and rollback behavior documented for the Rust/Soroban registry.
