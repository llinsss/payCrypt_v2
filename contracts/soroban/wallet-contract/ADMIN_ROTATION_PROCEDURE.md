# Emergency Admin Key Rotation Procedure

This document outlines the design and operational procedures for rotating the administrator key in the `payCrypt_v2` Soroban wallet contract. This procedure is primarily designed for emergency scenarios where the admin key may be compromised or needs to be transferred to a more secure cold-storage solution.

## Trust Boundary & Privileged Roles
- **Trust Boundary**: The contract guarantees that only the current valid `Admin` can initiate a rotation. The rotation is a two-step process to prevent accidental lockouts due to typos in the new address.
- **Roles**:
  - `Admin`: Can propose a new admin address.
  - `PendingAdmin`: The address proposed to become the new admin. It must explicitly accept the rotation.

## Procedure
1. **Proposal**: The current `Admin` calls `propose_admin_rotation(env, caller, new_admin)`. 
   - This sets `DataKey::PendingAdmin` to `new_admin`. 
   - `new_admin` cannot be the same as the current `Admin`.
2. **Execution**: The `PendingAdmin` calls `execute_admin_rotation(env, caller)`.
   - This verifies that `caller` matches `PendingAdmin`.
   - It updates `DataKey::Admin` to the `PendingAdmin` address and removes the `PendingAdmin` entry.
   - It emits an `AdminRotated` event.

## Failure-Safe State Transitions
- **Typo in Proposal**: If the `Admin` makes a typo when proposing the `new_admin`, the rotation is not finalized. The `Admin` retains their role and can call `propose_admin_rotation` again with the correct address, overwriting the previous `PendingAdmin`. This guarantees that the contract is never left in an un-administrable state due to a bad address.
- **Replay Behavior**: Soroban's native auth framework and state transition determinism prevent replay attacks. Once the `PendingAdmin` executes the rotation, they become the new `Admin`, and the old `Admin`'s authority is immediately revoked. Any delayed or replayed transactions from the old `Admin` will fail authorization.

## Indexing & Monitoring
- **Events**: The contract emits an `AdminRotated` event upon successful rotation. Indexers (e.g., Soroban RPC or custom data lakes) should listen for:
  - `event_type`: `Symbol("wallet_admin_rotated")`
  - `old_admin`: `Address`
  - `new_admin`: `Address`
- **Monitoring**: Alerts should be configured for the `AdminRotated` event. Given the sensitivity of the admin key, any unexpected rotation should trigger immediate incident response procedures.

## Migration & Rollback Behavior
- **Migration**: During migration to new contract versions, the `Admin` key should be verified. If rotating the admin key as part of a migration, ensure the new key is fully accessible before executing the final step.
- **Rollback**: If a rotation was executed maliciously or erroneously (assuming the original admin or team still controls the new key), the procedure must be executed again in reverse (propose the original key as the new admin, then execute the rotation from the original key). Since the old key cannot force a rollback once the new key accepts, securing the `PendingAdmin` key is critical.
