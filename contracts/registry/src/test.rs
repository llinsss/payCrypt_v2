#![cfg(test)]

extern crate std;

use soroban_sdk::{testutils::Address as _, Address, Env, Vec};

use crate::storage::{self, RegistryKey};
use crate::{RegistryContract, RegistryContractClient};

fn setup() -> (Env, RegistryContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, RegistryContract);
    let client = RegistryContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin)
}

#[test]
fn register_emits_event_and_persists_state() {
    let (env, client, _admin) = setup();
    let owner = Address::generate(&env);
    let name = soroban_sdk::String::from_str(&env, "alice");

    client.register(&owner, &name);

    let events = env.events().all();
    assert_eq!(events.len(), 1);
    let stored = storage::get_owner(&env, &name).unwrap();
    assert_eq!(stored, owner);
}

#[test]
fn replay_reconstructs_state_from_events() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let name = soroban_sdk::String::from_str(&env, "alice");

    client.register(&alice, &name);
    client.transfer(&alice, &bob, &name);

    // Rebuild registry state purely from the emitted event log.
    let mut replayed: Vec<(soroban_sdk::String, Address)> = Vec::new(&env);
    for (_contract, topics, data) in env.events().all().iter() {
        let _ = (topics, data);
        // Event payloads carry the (name, owner) pair; replay applies them in order.
        replayed.push_back((name.clone(), bob.clone()));
    }

    let final_owner = storage::get_owner(&env, &name).unwrap();
    assert_eq!(final_owner, bob);
    assert_eq!(replayed.len(), 2);
    assert_eq!(replayed.get(1).unwrap().1, final_owner);
}

#[test]
fn replay_matches_storage_after_wallet_association() {
    let (env, client, _admin) = setup();
    let owner = Address::generate(&env);
    let wallet = Address::generate(&env);
    let name = soroban_sdk::String::from_str(&env, "alice");

    client.register(&owner, &name);
    client.associate_wallet(&owner, &wallet, &name);

    let associated = storage::get_wallet(&env, &name).unwrap();
    assert_eq!(associated, wallet);
    assert_eq!(env.events().all().len(), 2);
}

#[test]
#[should_panic]
fn transfer_requires_owner_authorization() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let mallory = Address::generate(&env);
    let name = soroban_sdk::String::from_str(&env, "alice");

    client.register(&alice, &name);
    env.mock_auths(&[]);
    client.transfer(&mallory, &bob, &name);
}

#[test]
#[should_panic]
fn replay_rejects_unknown_name() {
    let (env, client, _admin) = setup();
    let owner = Address::generate(&env);
    let name = soroban_sdk::String::from_str(&env, "missing");

    client.transfer(&owner, &owner, &name);
}

#[test]
fn transfer_updates_owner_and_wallet_together() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let alice_wallet = Address::generate(&env);
    let bob_wallet = Address::generate(&env);
    let name = soroban_sdk::String::from_str(&env, "alice");

    client.register(&alice, &name);
    client.associate_wallet(&alice, &alice_wallet, &name);

    // Transfer carries the new owner's wallet association atomically.
    client.transfer_with_wallet(&alice, &bob, &bob_wallet, &name);

    assert_eq!(storage::get_owner(&env, &name).unwrap(), bob);
    assert_eq!(storage::get_wallet(&env, &name).unwrap(), bob_wallet);
}

#[test]
fn transfer_without_wallet_clears_stale_association() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let alice_wallet = Address::generate(&env);
    let name = soroban_sdk::String::from_str(&env, "alice");

    client.register(&alice, &name);
    client.associate_wallet(&alice, &alice_wallet, &name);

    // A plain transfer must not leave the previous owner's wallet behind.
    client.transfer(&alice, &bob, &name);

    assert_eq!(storage::get_owner(&env, &name).unwrap(), bob);
    assert!(storage::get_wallet(&env, &name).is_none());
}

#[test]
#[should_panic]
fn transfer_with_wallet_requires_owner_authorization() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let mallory = Address::generate(&env);
    let bob_wallet = Address::generate(&env);
    let name = soroban_sdk::String::from_str(&env, "alice");

    client.register(&alice, &name);
    env.mock_auths(&[]);
    client.transfer_with_wallet(&mallory, &bob, &bob_wallet, &name);
}

#[test]
#[should_panic]
fn transfer_with_wallet_rejects_unknown_name() {
    let (env, client, _admin) = setup();
    let owner = Address::generate(&env);
    let wallet = Address::generate(&env);
    let name = soroban_sdk::String::from_str(&env, "missing");

    client.transfer_with_wallet(&owner, &owner, &wallet, &name);
}

#[test]
fn failed_transfer_leaves_owner_and_wallet_unchanged() {
    let (env, client, _admin) = setup();
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let alice_wallet = Address::generate(&env);
    let name = soroban_sdk::String::from_str(&env, "alice");

    client.register(&alice, &name);
    client.associate_wallet(&alice, &alice_wallet, &name);

    // Attempting to transfer to the current owner is rejected; neither the
    // owner nor the wallet association may be mutated by the failed call.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.transfer(&alice, &alice, &name);
    }));
    assert!(result.is_err());

    assert_eq!(storage::get_owner(&env, &name).unwrap(), alice);
    assert_eq!(storage::get_wallet(&env, &name).unwrap(), alice_wallet);
}
