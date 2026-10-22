# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

### Security
- Circuit breaker inspection and reset endpoints are now restricted to
  authenticated admins, resets are rate-limited, and successful resets are
  written to the audit log (#553).
- Documented tag normalization security assumptions (#955): the accepted Unicode
  subset, the normalization form applied, the confusable/skeleton policy, and
  the compatibility implications for clients.
- Explicit checked arithmetic policy for version counters and amount
  accounting (#1007). State version bumps in the `tag` contract and event
  version bumps in `tag_registry` now use checked addition: at `u32::MAX` the
  operation fails with the new `TagError::VersionOverflow` (6) or
  `RegistryError::VersionOverflow` (7) instead of saturating or wrapping, so a
  version is never reused or silently stalled. Payment cancellation computes the
  remaining refundable amount with checked subtraction and returns
  `PaymentError::RefundExceedsFunded` if refunded exceeds funded. Existing error
  codes are unchanged; no event payloads change. Storage growth and
  per-invocation work are unchanged.
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

- Rust/Soroban registry: prevent tag squatting (#810).
  - **Typed validation:** tag registration is validated deterministically before any state is written — tag format/normalization, ownership, and reservation checks are enforced by typed Rust logic rather than ad-hoc string handling.
  - **Trust boundary & privileged roles:** the registry defines who may register, reserve, transfer, and release a tag. Registration is restricted to the authenticated owner of the tag; reservation and administrative transfer/release require an explicit privileged role. Unauthorized callers are rejected before state mutation.
  - **Replay behavior:** duplicate or replayed registration/transfer operations are handled idempotently — a replay of an already-applied operation is a no-op that returns the existing state instead of creating a conflicting owner.
  - **Failure-safe transitions:** tag ownership changes are applied atomically; a partial or failed operation cannot leave inconsistent tag ownership, and failed transitions roll back to the prior consistent state.
  - **Tests:** unit/property/local-network coverage for success, boundary, unauthorized, replay, and failure paths.
  - **Docs:** migration, indexing, monitoring, and rollback behavior documented for the Rust/Soroban registry.

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

- Soroban persistent contract schema versioning (#775):
  - Typed persistent storage record for schema versioning (`current_version`,
    `min_supported_version`, and bounded upgrade history metadata) stored
    under a dedicated persistent key.
  - Deterministic validation of schema versions: monotonic non-decreasing
    upgrades, supported-range checks against `min_supported_version`, and
    idempotent/replay rejection of already-applied versions.
  - Admin-gated authorization on version mutation via `require_auth`,
    rejecting unauthorized callers with typed errors.
  - `schema_version_updated` contract event with stable topic tuple and typed
    payload for off-chain indexing and monitoring.
  - Unit/property/local-network tests covering success, boundary,
    unauthorized, replay, and failure paths for schema versioning.
  - Documentation of migration, indexing, monitoring, and rollback behavior
    for persistent schema versioning.

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
- **Payment intent lifecycle states (#780):** Soroban payments contract now
  models payment intents with an explicit, typed lifecycle. Each intent records
  its payer, payee, asset, amount, and current `PaymentIntentStatus`, and may
  only advance through deterministic, validated transitions. Includes:
  - Typed `PaymentIntent` storage keyed by `intent_id` with a `PaymentIntentStatus`
    enum (`Created`, `Authorized`, `Funded`, `Settled`, `Cancelled`, `Expired`)
    and deterministic transition validation that rejects illegal or repeated
    transitions.
  - Authorization checks so only the payer may authorize/cancel and only the
    payee (or payer) may settle; unauthorized callers are rejected.
  - Typed events emitted for every lifecycle transition
    (`intent_created`, `intent_authorized`, `intent_funded`, `intent_settled`,
    `intent_cancelled`, `intent_expired`).
  - Unit/property/local-network tests covering success, boundary, unauthorized,
    replay, and failure paths.

### Migration / Indexing / Monitoring / Rollback

- **Migration:** Existing public tags default to a zero deposit until the admin
  sets a configuration; no data backfill is required. Existing single-asset
  escrow entries are migrated to the new per-asset key space on first access;
  no manual data migration is required. The contract version is bumped and
  older entries remain readable during the upgrade window. Payment intent
  records are stored under additive `intent_id` keys, so pre-existing intents
  (if any) are read as `Created` and can be advanced through the normal
  lifecycle without a data migration.
- **Indexing:** Emit a `deposit` event (tag address, asset, amount, deposit id)
  for off-chain indexers; idempotent ids let indexers deduplicate replays.
  Off-chain indexers should key escrow records by `(asset, escrow_id)` and
  consume the new escrow events (`escrow_created`, `escrow_released`,
  `escrow_refunded`, `escrow_asset_isolated`). Indexers should key payment
  intents by `intent_id` and track status by consuming the intent lifecycle
  events (`intent_created`, `intent_authorized`, `intent_funded`,
  `intent_settled`, `intent_cancelled`, `intent_expired`).
- **Monitoring:** Alert on repeated unauthorized config attempts and on
  deposit-id collisions. Alert on repeated unauthorized escrow attempts and on
  any escrow event whose asset does not match the stored escrow asset. Alert on
  repeated unauthorized intent transitions, on any intent event whose status
  does not follow the expected transition graph, and on intents stuck in a
  non-terminal state past their expiry window.
- **Rollback:** Disabling deposits is a config change (set amount to zero); no
  state migration is needed to revert. Reverting to the previous contract
  version is safe because the per-asset keys are additive; legacy single-asset
  reads continue to work until the new entries are drained. Payment intent keys
  are likewise additive, so a rollback leaves intent records intact and
  readable by the prior version.
