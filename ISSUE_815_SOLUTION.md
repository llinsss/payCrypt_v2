# #815 Prevent cross-contract callback confusion

## Trust Boundary & Privileged Roles
- **Callback Source**: Only a verified and authorized contract address (e.g., a specific token contract) may invoke sensitive callbacks.
- **Untrusted Contracts**: Any other contract attempting to invoke the callback will be rejected.

## Typed Rust Implementation (Soroban)
```rust
use soroban_sdk::{contract, contractimpl, Address, Env};

#[contract]
pub struct CallbackGuardedContract;

#[contractimpl]
impl CallbackGuardedContract {
    pub fn on_token_transfer(env: Env, caller: Address, amount: i128) {
        // Deterministic validation: Prevent callback confusion
        let expected_token = Self::get_authorized_token(&env);
        caller.require_auth();
        
        if caller != expected_token {
            panic!("Unauthorized callback source");
        }
        
        // Handle callback logic
    }
    
    fn get_authorized_token(env: &Env) -> Address {
        env.storage().instance().get(&soroban_sdk::symbol_short!("token")).unwrap()
    }
}
```

## Replay Behavior & State Transitions
- **Replay Protection**: Callbacks should rely on idempotent state transitions or validate unique nonce/sequence numbers provided by the trusted source.
- **Failure-Safe Transitions**: If an unauthorized contract calls the callback, the transaction instantly panics, preventing partial state modifications.

## Testing Strategy
- **Success Paths**: Trigger the callback from the configured `expected_token`.
- **Boundary/Unauthorized Tests**: Invoke the callback from a malicious or unrelated contract address and assert the "Unauthorized callback source" panic.
- **Replay**: Attempt to invoke the callback multiple times from the trusted source with the same parameters to ensure idempotency or expected rejection.

## Operational Behavior
- **Migration**: Set the trusted token address during contract initialization. 
- **Indexing**: Log `CallbackProcessed` events containing the source address.
- **Monitoring**: Alert on `Unauthorized callback source` errors which could indicate an attack attempt.
- **Rollback**: If the trusted token contract needs changing, use an admin delay action to update the `token` address.
