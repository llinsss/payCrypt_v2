//! Registry contract: on-chain name registry with event emission.
//!
//! # Externally visible behavior
//!
//! The registry emits events for every state-changing operation so that
//! off-chain indexers can reconstruct the full registry state by replaying
//! the event log. The reconstruction invariant is:
//!
//! ```text
//! replay(events) == contract storage
//! ```
//!
//! Event topics and payloads:
//! - `register`  -> (name, owner, wallet)
//! - `transfer`  -> (name, from, to, wallet)
//! - `associate` -> (name, wallet)
//!
//! # Atomicity
//!
//! `transfer` updates the owner and the associated wallet together. The
//! wallet is carried over to the new owner in the same storage write, so a
//! transfer can never leave the owner and wallet out of sync. If validation
//! or storage fails, neither the owner nor the wallet is updated.
//!
//! # Error codes
//! - `AlreadyRegistered` (1): name already has an owner.
//! - `NotOwner` (2): caller is not the current owner of the name.
//! - `NotFound` (3): name has no registered owner.

#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Registration {
    pub owner: Address,
    pub wallet: Address,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RegistryError {
    AlreadyRegistered = 1,
    NotOwner = 2,
    NotFound = 3,
}

const REGISTRY: Symbol = symbol_short!("REGISTRY");

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    /// Register `name` for `owner`, associating `wallet`.
    pub fn register(env: Env, name: String, owner: Address, wallet: Address) -> Result<(), RegistryError> {
        owner.require_auth();
        let mut registry = Self::load(&env);
        if registry.iter().any(|r| r.0 == name) {
            return Err(RegistryError::AlreadyRegistered);
        }
        registry.push_back((name.clone(), Registration { owner: owner.clone(), wallet: wallet.clone() }));
        Self::save(&env, &registry);
        env.events().publish((symbol_short!("register"), name), (owner, wallet));
        Ok(())
    }

    /// Transfer ownership of `name` to `to`, carrying the associated wallet
    /// over to the new owner atomically.
    pub fn transfer(env: Env, name: String, to: Address) -> Result<(), RegistryError> {
        let mut registry = Self::load(&env);
        let idx = registry.iter().position(|r| r.0 == name).ok_or(RegistryError::NotFound)?;
        let (n, mut reg) = registry.get(idx).unwrap();
        reg.owner.require_auth();
        let from = reg.owner.clone();
        let wallet = reg.wallet.clone();
        // Update owner and wallet together in a single registration value so
        // the two fields can never diverge, then persist once.
        reg.owner = to.clone();
        reg.wallet = wallet.clone();
        registry.set(idx, (n, reg));
        Self::save(&env, &registry);
        env.events().publish((symbol_short!("transfer"), name), (from, to, wallet));
        Ok(())
    }

    /// Associate a new `wallet` with `name`.
    pub fn associate(env: Env, name: String, wallet: Address) -> Result<(), RegistryError> {
        let mut registry = Self::load(&env);
        let idx = registry.iter().position(|r| r.0 == name).ok_or(RegistryError::NotFound)?;
        let (n, mut reg) = registry.get(idx).unwrap();
        reg.owner.require_auth();
        reg.wallet = wallet.clone();
        registry.set(idx, (n, reg));
        Self::save(&env, &registry);
        env.events().publish((symbol_short!("associate"), name), wallet);
        Ok(())
    }

    /// Read the current registration for `name`.
    pub fn get(env: Env, name: String) -> Option<Registration> {
        Self::load(&env).iter().find(|r| r.0 == name).map(|r| r.1)
    }

    fn load(env: &Env) -> Vec<(String, Registration)> {
        env.storage().instance().get(&REGISTRY).unwrap_or_else(|| Vec::new(env))
    }

    fn save(env: &Env, registry: &Vec<(String, Registration)>) {
        env.storage().instance().set(&REGISTRY, registry);
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Events}, Env};

    fn setup() -> (Env, RegistryContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &id);
        (env, client)
    }

    /// Reconstruct registry state purely from emitted events and compare it
    /// against contract storage. This is the core replay invariant test.
    #[test]
    fn replay_reconstructs_storage() {
        let (env, client) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let carol = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");

        client.register(&name, &alice, &alice);
        client.transfer(&name, &bob);
        client.associate(&name, &carol);

        // Rebuild state from the event log only.
        let mut replayed: Option<Registration> = None;
        for event in env.events().all().iter() {
            let (topics, data) = event;
            let topic0: Symbol = topics.get(0).unwrap().try_into().unwrap();
            if topic0 == symbol_short!("register") {
                let (owner, wallet): (Address, Address) = data.try_into().unwrap();
                replayed = Some(Registration { owner, wallet });
            } else if topic0 == symbol_short!("transfer") {
                let (_from, to, wallet): (Address, Address, Address) = data.try_into().unwrap();
                let reg = replayed.as_mut().unwrap();
                reg.owner = to;
                reg.wallet = wallet;
            } else if topic0 == symbol_short!("associate") {
                let wallet: Address = data.try_into().unwrap();
                replayed.as_mut().unwrap().wallet = wallet;
            }
        }

        assert_eq!(replayed, client.get(&name));
        assert_eq!(replayed.unwrap().owner, bob);
        assert_eq!(replayed.unwrap().wallet, carol);
    }

    #[test]
    fn register_emits_event_and_stores() {
        let (env, client) = setup();
        let alice = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");
        client.register(&name, &alice, &alice);
        assert_eq!(client.get(&name).unwrap().owner, alice);
        assert_eq!(env.events().all().len(), 1);
    }

    #[test]
    fn duplicate_register_fails() {
        let (env, client) = setup();
        let alice = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");
        client.register(&name, &alice, &alice);
        assert_eq!(client.try_register(&name, &alice, &alice), Err(Ok(RegistryError::AlreadyRegistered)));
    }

    #[test]
    fn transfer_requires_owner_auth() {
        let env = Env::default();
        let id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &id);
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");
        env.mock_all_auths();
        client.register(&name, &alice, &alice);
        // Without mocked auth for bob, transfer must fail authorization.
        env.set_auths(&[]);
        assert!(client.try_transfer(&name, &bob).is_err());
    }

    #[test]
    fn transfer_unknown_name_fails() {
        let (env, client) = setup();
        let bob = Address::generate(&env);
        let name = String::from_str(&env, "missing.xlm");
        assert_eq!(client.try_transfer(&name, &bob), Err(Ok(RegistryError::NotFound)));
    }

    #[test]
    fn associate_unknown_name_fails() {
        let (env, client) = setup();
        let wallet = Address::generate(&env);
        let name = String::from_str(&env, "missing.xlm");
        assert_eq!(client.try_associate(&name, &wallet), Err(Ok(RegistryError::NotFound)));
    }

    /// Transfer carries the associated wallet over to the new owner in the
    /// same write, so owner and wallet stay consistent.
    #[test]
    fn transfer_carries_wallet_atomically() {
        let (env, client) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let wallet = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");

        client.register(&name, &alice, &wallet);
        client.transfer(&name, &bob);

        let reg = client.get(&name).unwrap();
        assert_eq!(reg.owner, bob);
        assert_eq!(reg.wallet, wallet);
    }

    /// A failed transfer (unknown name) must not mutate any stored state.
    #[test]
    fn failed_transfer_leaves_state_unchanged() {
        let (env, client) = setup();
        let alice = Address::generate(&env);
        let bob = Address::generate(&env);
        let wallet = Address::generate(&env);
        let name = String::from_str(&env, "alice.xlm");

        client.register(&name, &alice, &wallet);
        let before = client.get(&name).unwrap();

        let missing = String::from_str(&env, "missing.xlm");
        assert_eq!(client.try_transfer(&missing, &bob), Err(Ok(RegistryError::NotFound)));

        // Original registration is untouched: owner and wallet both intact.
        assert_eq!(client.get(&name).unwrap(), before);
        assert_eq!(client.get(&name).unwrap().owner, alice);
        assert_eq!(client.get(&name).unwrap().wallet, wallet);
    }
}
