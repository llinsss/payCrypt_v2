#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, Symbol};

/// Storage keys for the escrow contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// The party that funds the escrow and may cancel before release.
    Depositor,
    /// The party that receives the funds on release.
    Beneficiary,
    /// The token contract used for the escrowed amount.
    Token,
    /// The escrowed amount.
    Amount,
    /// The ledger timestamp after which the escrow can be expired.
    Expiry,
    /// The current state of the escrow.
    State,
}

/// Explicit state machine for the escrow lifecycle.
///
/// ```text
///            create
///              |
///              v
///          +--------+   release (depositor)   +-----------+
///          | Active | ----------------------> |  Released |  (terminal)
///          +--------+                         +-----------+
///            |   |
///   cancel   |   |  expire (after Expiry)
/// (depositor)|   |  (anyone)
///            v   v
///        +-----------+   +-----------+
///        | Cancelled |   |  Expired  |  (both terminal)
///        +-----------+   +-----------+
/// ```
///
/// `Active` is the only non-terminal state. `Released`, `Cancelled` and
/// `Expired` are terminal: once entered, no further transition is possible.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowState {
    Active = 0,
    Released = 1,
    Cancelled = 2,
    Expired = 3,
}

#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InvalidExpiry = 4,
    NotActive = 5,
    NotYetExpired = 6,
}

/// Emitted on every state transition. Topics are indexed so indexers can
/// filter by escrow state and by the acting party.
#[contracttype]
#[derive(Clone)]
pub struct StateChanged {
    pub from: EscrowState,
    pub to: EscrowState,
    pub actor: Address,
}

const STATE: Symbol = symbol_short!("state");

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create a new escrow. The depositor funds the contract with `amount` of
    /// `token` and designates `beneficiary`. The escrow becomes `Active`.
    pub fn create(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        token: Address,
        amount: i128,
        expiry: u64,
    ) -> Result<(), EscrowError> {
        if env.storage().instance().has(&DataKey::State) {
            return Err(EscrowError::AlreadyInitialized);
        }
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        if expiry <= env.ledger().timestamp() {
            return Err(EscrowError::InvalidExpiry);
        }

        depositor.require_auth();

        // Pull the funds into the escrow contract.
        token::Client::new(&env, &token).transfer(
            &depositor,
            &env.current_contract_address(),
            &amount,
        );

        let store = env.storage().instance();
        store.set(&DataKey::Depositor, &depositor);
        store.set(&DataKey::Beneficiary, &beneficiary);
        store.set(&DataKey::Token, &token);
        store.set(&DataKey::Amount, &amount);
        store.set(&DataKey::Expiry, &expiry);
        store.set(&DataKey::State, &EscrowState::Active);

        Self::emit_transition(&env, EscrowState::Active, EscrowState::Active, &depositor);
        Ok(())
    }

    /// Release the escrowed funds to the beneficiary. Only the depositor may
    /// release, and only while the escrow is `Active`.
    pub fn release(env: Env) -> Result<(), EscrowError> {
        let state = Self::state(&env)?;
        if state != EscrowState::Active {
            return Err(EscrowError::NotActive);
        }

        let depositor: Address = env.storage().instance().get(&DataKey::Depositor).unwrap();
        depositor.require_auth();

        let beneficiary: Address = env.storage().instance().get(&DataKey::Beneficiary).unwrap();
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let amount: i128 = env.storage().instance().get(&DataKey::Amount).unwrap();

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &beneficiary,
            &amount,
        );

        env.storage().instance().set(&DataKey::State, &EscrowState::Released);
        Self::emit_transition(&env, EscrowState::Active, EscrowState::Released, &depositor);
        Ok(())
    }

    /// Cancel the escrow and refund the depositor. Only the depositor may
    /// cancel, and only while the escrow is `Active`.
    pub fn cancel(env: Env) -> Result<(), EscrowError> {
        let state = Self::state(&env)?;
        if state != EscrowState::Active {
            return Err(EscrowError::NotActive);
        }

        let depositor: Address = env.storage().instance().get(&DataKey::Depositor).unwrap();
        depositor.require_auth();

        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let amount: i128 = env.storage().instance().get(&DataKey::Amount).unwrap();

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &depositor,
            &amount,
        );

        env.storage().instance().set(&DataKey::State, &EscrowState::Cancelled);
        Self::emit_transition(&env, EscrowState::Active, EscrowState::Cancelled, &depositor);
        Ok(())
    }

    /// Expire the escrow after its deadline and refund the depositor. Anyone
    /// may trigger expiry once the deadline has passed.
    pub fn expire(env: Env) -> Result<(), EscrowError> {
        let state = Self::state(&env)?;
        if state != EscrowState::Active {
            return Err(EscrowError::NotActive);
        }

        let expiry: u64 = env.storage().instance().get(&DataKey::Expiry).unwrap();
        if env.ledger().timestamp() < expiry {
            return Err(EscrowError::NotYetExpired);
        }

        let depositor: Address = env.storage().instance().get(&DataKey::Depositor).unwrap();
        let token: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let amount: i128 = env.storage().instance().get(&DataKey::Amount).unwrap();

        token::Client::new(&env, &token).transfer(
            &env.current_contract_address(),
            &depositor,
            &amount,
        );

        env.storage().instance().set(&DataKey::State, &EscrowState::Expired);
        Self::emit_transition(&env, EscrowState::Active, EscrowState::Expired, &depositor);
        Ok(())
    }

    /// Read the current escrow state.
    pub fn get_state(env: Env) -> Result<EscrowState, EscrowError> {
        Self::state(&env)
    }

    fn state(env: &Env) -> Result<EscrowState, EscrowError> {
        env.storage()
            .instance()
            .get(&DataKey::State)
            .ok_or(EscrowError::NotInitialized)
    }

    /// Emit an indexed event for a state transition. The `state` topic is
    /// indexed so indexers can filter transitions, and the acting party is
    /// included in the payload.
    fn emit_transition(env: &Env, from: EscrowState, to: EscrowState, actor: &Address) {
        env.events().publish(
            (STATE, to),
            StateChanged {
                from,
                to,
                actor: actor.clone(),
            },
        );
    }
}
