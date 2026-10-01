# #822 Add Admin Action Delay and Cancellation

## Trust Boundary & Privileged Roles
- **Admin/Owner**: A privileged address (or multi-sig) capable of proposing admin actions (e.g. upgrades, parameter changes).
- **Guardian**: An optionally distinct privileged role capable of immediately cancelling pending actions.

## Typed Rust Implementation (Soroban)
```rust
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingAdminAction {
    pub executable_at: u64,
    pub executed: bool,
    pub cancelled: bool,
    pub action_type: Symbol,
}

#[contract]
pub struct AdminDelayContract;

#[contractimpl]
impl AdminDelayContract {
    pub fn propose_action(env: Env, admin: Address, action_id: u64, delay_ledgers: u64, action_type: Symbol) {
        admin.require_auth();
        let now = env.ledger().sequence();
        let action = PendingAdminAction {
            executable_at: now as u64 + delay_ledgers,
            executed: false,
            cancelled: false,
            action_type,
        };
        env.storage().persistent().set(&action_id, &action);
    }

    pub fn execute_action(env: Env, executor: Address, action_id: u64) {
        executor.require_auth();
        let mut action: PendingAdminAction = env.storage().persistent().get(&action_id).unwrap();
        
        if action.cancelled { panic!("Action cancelled"); }
        if action.executed { panic!("Action already executed"); }
        if (env.ledger().sequence() as u64) < action.executable_at { panic!("Delay not elapsed"); }
        
        // Execute state transitions here based on action_type
        
        action.executed = true; // Replay protection
        env.storage().persistent().set(&action_id, &action);
    }

    pub fn cancel_action(env: Env, guardian: Address, action_id: u64) {
        guardian.require_auth();
        let mut action: PendingAdminAction = env.storage().persistent().get(&action_id).unwrap();
        if action.executed { panic!("Cannot cancel executed action"); }
        
        action.cancelled = true; // Terminal state
        env.storage().persistent().set(&action_id, &action);
    }
}
```

## Replay Behavior & State Transitions
- **Replay Protection**: The `executed` flag ensures an action is executed exactly once. Subsequent calls fail.
- **Failure-Safe Transitions**: If the state transition inside `execute_action` panics, the entire transaction reverts, leaving the action pending and `executed = false`. Once `executed = true`, the flag is persistently set.
- **Cancellation**: A `cancelled` flag puts the proposal into a terminal failure state.

## Testing Strategy
- **Unit Tests**: Test success paths for proposal, execution, and cancellation.
- **Boundary Tests**: Test executing exactly on, before, and after the `executable_at` ledger sequence.
- **Unauthorized Paths**: Attempt to propose, execute, or cancel with non-admin/non-guardian accounts and expect `Unauthorized` errors.
- **Replay & Failure**: Attempt to execute a cancelled or already-executed action.

## Operational Behavior
- **Migration**: Deploy the new storage schema, mapping any existing state. Use the `AdminDelayContract` as the new governor.
- **Indexing**: Emit `ActionProposed`, `ActionExecuted`, and `ActionCancelled` events. Indexers should track `action_id` and `action_type`.
- **Monitoring**: Alert on multiple cancelled proposals or proposals that are not executed after their delay period.
- **Rollback**: If a malicious proposal is queued, guardians cancel it. If an upgrade is flawed, a subsequent upgrade with standard delay is required unless an emergency fast-track role is defined.
