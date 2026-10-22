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

### Migration & operations

- **Migration:** Existing single-asset escrow entries are migrated to the new
  per-asset key space on first access; no manual data migration is required.
  The contract version is bumped and older entries remain readable during the
  upgrade window. Payment intent records are stored under additive `intent_id`
  keys, so pre-existing intents (if any) are read as `Created` and can be
  advanced through the normal lifecycle without a data migration.
- **Indexing:** Off-chain indexers should key escrow records by
  `(asset, escrow_id)` and consume the new escrow events (`escrow_created`,
  `escrow_released`, `escrow_refunded`, `escrow_asset_isolated`). Indexers should
  key payment intents by `intent_id` and track status by consuming the intent
  lifecycle events (`intent_created`, `intent_authorized`, `intent_funded`,
  `intent_settled`, `intent_cancelled`, `intent_expired`).
- **Monitoring:** Alert on repeated unauthorized escrow attempts and on any
  escrow event whose asset does not match the stored escrow asset. Alert on
  repeated unauthorized intent transitions, on any intent event whose status
  does not follow the expected transition graph, and on intents stuck in a
  non-terminal state past their expiry window.
- **Rollback:** Reverting to the previous contract version is safe because the
  per-asset keys are additive; legacy single-asset reads continue to work until
  the new entries are drained. Payment intent keys are likewise additive, so a
  rollback leaves intent records intact and readable by the prior version.
