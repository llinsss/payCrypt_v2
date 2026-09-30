## Description
Fixes #820

This PR implements an emergency admin key rotation procedure for the repository's Rust/Soroban migration. The rotation logic uses a two-step mechanism (propose & execute) to provide failure-safe state transitions and prevent accidental lockouts due to typos. 

## Changes Made
* **Implementation (`lib.rs`)**: 
  * Introduced `propose_admin_rotation` and `execute_admin_rotation` functions.
  * Added `DataKey::PendingAdmin` to facilitate the two-step safety check.
  * Added an `AdminRotated` event for downstream monitoring and indexing.
* **Testing (`test.rs`)**:
  * Added `admin_rotation_works_and_validates_correctly` to test successful execution, boundary limits (such as preventing self-proposal), unauthorized calls, and failure paths.
* **Documentation (`ADMIN_ROTATION_PROCEDURE.md`)**:
  * Outlined the trust boundary, privileged roles, replay attack prevention, monitoring, and rollback behavior.

## Acceptance Criteria
- [x] Add typed Rust implementation or design artifacts with deterministic validation.
- [x] Add unit/property/local-network tests for success, boundary, unauthorized, replay, and failure paths.
- [x] Document migration, indexing, monitoring, and rollback behavior.

## Security Considerations
* **Replay Protection**: Soroban's state transition determinism guarantees that once the new admin executes the rotation, the old admin's authority is immediately stripped, and replay attempts fail.
* **Typo Lockout Prevention**: Enforced via the two-step `PendingAdmin` role. If a bad address is proposed, the rotation will never be executed by that address, and the current Admin can propose a new valid one.
