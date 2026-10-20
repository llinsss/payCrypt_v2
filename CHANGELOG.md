# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added

- Contract pause and recovery operational runbook (issue #1003).

### Documentation

- **Pause authority.** Pausing and unpausing are gated by the contract's admin authority. The admin address is set at initialization and is the only principal permitted to invoke the pause/unpause entrypoints; each call requires the admin's authorization (Soroban `require_auth`). Where the deployment uses a multisig or governance contract as the admin, the same authorization requirement applies and the multisig's own threshold rules govern who can trigger a pause. There is no separate "pauser" role: pause authority is exactly the admin authority.
- **Monitoring signals.** Operators should watch for the pause/unpause events emitted on state transitions, the paused state flag exposed by the contract's read-only getter, and the contract's error codes returned when an operation is rejected because the contract is paused. A spike in paused-rejection errors, or an unexpected pause event, indicates a pause is in effect and should trigger the recovery procedure below.
- **Recovery / unpause procedure.** (1) Confirm the pause is intentional and identify the triggering condition. (2) Verify the root cause is resolved and any off-chain dependencies are healthy. (3) Have the admin (or multisig quorum) submit the unpause transaction. (4) Verify the paused state flag reads as unpaused and that a representative operation succeeds. (5) Confirm the unpause event was emitted and monitor for regressions.
- **Limits of emergency controls.** Pause only blocks new state-changing invocations that check the paused flag. It does not cancel or revert transactions already in flight or already executed, does not affect already-settled state, does not stop off-chain services or indexers, and does not prevent read-only queries. Pause is a circuit breaker, not a rollback mechanism.
