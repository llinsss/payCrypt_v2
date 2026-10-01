# #814 Add reentrancy-equivalent guards for Soroban callbacks

## Trust Boundary & Privileged Roles
- **Soroban Execution Model**: Soroban does not support reentrancy by default. However, cross-contract calls that trigger callbacks back into the same contract must be explicitly guarded if they mutate state, to prevent logical reentrancy attacks.

## Typed Rust Implementation (Soroban)
```rust
use soroban_sdk::{contract, contractimpl, Env, Symbol};

#[contract]
pub struct ReentrancyGuardContract;

const ENTERED_FLAG: Symbol = soroban_sdk::symbol_short!("entered");

#[contractimpl]
impl ReentrancyGuardContract {
    pub fn withdraw(env: Env, amount: i128) {
        // Check reentrancy guard
        if env.storage().transient().get::<_, bool>(&ENTERED_FLAG).unwrap_or(false) {
            panic!("Reentrancy detected");
        }
        
        // Set guard
        env.storage().transient().set(&ENTERED_FLAG, &true);
        
        // External cross-contract call that might trigger a callback
        // token::Client::new(&env, &token_address).transfer(...);
        
        // Clear guard
        env.storage().transient().remove(&ENTERED_FLAG);
    }
}
```

## Replay Behavior & State Transitions
- **Replay Protection**: The `ENTERED_FLAG` is stored in `transient` storage, meaning it only persists for the duration of the transaction.
- **Failure-Safe Transitions**: If the external call panics, the entire transaction reverts, safely clearing the transient state. If the external call attempts to re-enter `withdraw`, the guard triggers a panic.

## Testing Strategy
- **Unit/Property Tests**: Verify that normal sequential calls succeed.
- **Boundary Tests**: Create a `malicious_token` (like `ReentrantToken`) that intentionally calls back into `withdraw`. Assert that the call fails with "Reentrancy detected".
- **Failure Paths**: Ensure that if an external call fails, the transaction is cleanly aborted without locking the contract permanently.

## Operational Behavior
- **Migration**: Reentrancy guards do not require persistent storage migration since they use transient storage.
- **Indexing**: Emitting events before the external call is recommended, but indexers must be aware that the transaction might revert.
- **Monitoring**: Monitor transaction revert rates containing the "Reentrancy detected" string.
- **Rollback**: Transient storage automatically cleans up at the end of the transaction, requiring no manual rollback.
