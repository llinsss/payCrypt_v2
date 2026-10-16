#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::{Address as _, Events as _}, token, Address, Env, IntoVal, Symbol};

fn setup(env: &Env) -> (Address, Address, Address, Address) {
    let contract_id = env.register_contract(None, EscrowContract);
    let depositor = Address::generate(env);
    let beneficiary = Address::generate(env);
    let token_admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    (contract_id, depositor, beneficiary, token_id)
}

#[test]
fn release_transfers_to_beneficiary() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.release();

    assert_eq!(token::Client::new(&env, &token_id).balance(&beneficiary), 100);
    assert_eq!(client.get().state, EscrowState::Released);
}

#[test]
fn cancel_refunds_depositor() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.cancel();

    assert_eq!(token::Client::new(&env, &token_id).balance(&depositor), 100);
    assert_eq!(client.get().state, EscrowState::Cancelled);
}

#[test]
fn cancel_before_funding_refunds_depositor() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    // Pre-funding state: escrow is Created but not yet released/expired.
    assert_eq!(client.get().state, EscrowState::Created);
    client.cancel();

    assert_eq!(token::Client::new(&env, &token_id).balance(&depositor), 100);
    assert_eq!(client.get().state, EscrowState::Cancelled);
}

#[test]
fn cancel_requires_depositor_auth() {
    let env = Env::default();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    // No auth mocked: the depositor's require_auth must reject the caller.
    assert!(client.try_cancel().is_err());
    assert_eq!(client.get().state, EscrowState::Created);
}

#[test]
fn cancel_cannot_be_replayed() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.cancel();

    // A second cancel must fail with a distinct error and leave state terminal.
    assert_eq!(client.try_cancel(), Err(Ok(EscrowError::NotCreated)));
    assert_eq!(client.get().state, EscrowState::Cancelled);
    assert_eq!(token::Client::new(&env, &token_id).balance(&depositor), 100);
}

#[test]
fn expire_after_expiry_ledger() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 5));

    assert_eq!(client.try_expire(), Err(Ok(EscrowError::NotExpired)));

    env.ledger().set_sequence_number(env.ledger().sequence() + 5);
    client.expire();

    assert_eq!(token::Client::new(&env, &token_id).balance(&depositor), 100);
    assert_eq!(client.get().state, EscrowState::Expired);
}

#[test]
fn terminal_state_blocks_further_transitions() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.release();

    assert_eq!(client.try_cancel(), Err(Ok(EscrowError::NotCreated)));
    assert_eq!(client.try_release(), Err(Ok(EscrowError::NotCreated)));
}

#[test]
fn extend_deadline_by_depositor_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    let deadline = env.ledger().sequence() + 10;
    client.create(&depositor, &beneficiary, &token_id, &100, &deadline);

    let new_deadline = client.extend_deadline(&depositor, &5);
    assert_eq!(new_deadline, deadline + 5);
    assert_eq!(client.get().deadline, deadline + 5);
    assert_eq!(client.get().extension_count, 1);
}

#[test]
fn extend_deadline_requires_depositor_auth() {
    let env = Env::default();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    let deadline = env.ledger().sequence() + 10;
    client.create(&depositor, &beneficiary, &token_id, &100, &deadline);

    // No auth mocked: the depositor's require_auth must reject the caller.
    assert!(client.try_extend_deadline(&depositor, &5).is_err());
    assert_eq!(client.get().deadline, deadline);
    assert_eq!(client.get().extension_count, 0);
}

#[test]
fn extend_deadline_rejects_non_depositor() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    let deadline = env.ledger().sequence() + 10;
    client.create(&depositor, &beneficiary, &token_id, &100, &deadline);

    // Only the depositor may extend; a different caller is rejected.
    assert_eq!(
        client.try_extend_deadline(&beneficiary, &5),
        Err(Ok(EscrowError::Unauthorized))
    );
    assert_eq!(client.get().deadline, deadline);
}

#[test]
fn extend_deadline_enforces_max_duration() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    let deadline = env.ledger().sequence() + 10;
    client.create(&depositor, &beneficiary, &token_id, &100, &deadline);

    // A single extension beyond the per-extension cap is rejected.
    assert_eq!(
        client.try_extend_deadline(&depositor, &(MAX_EXTENSION_DURATION + 1)),
        Err(Ok(EscrowError::ExtensionTooLong))
    );
    assert_eq!(client.get().deadline, deadline);
    assert_eq!(client.get().extension_count, 0);
}

#[test]
fn extend_deadline_enforces_max_count() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    let deadline = env.ledger().sequence() + 10;
    client.create(&depositor, &beneficiary, &token_id, &100, &deadline);

    for _ in 0..MAX_EXTENSIONS {
        client.extend_deadline(&depositor, &1);
    }

    // Once the extension count cap is reached, further extensions are rejected.
    assert_eq!(
        client.try_extend_deadline(&depositor, &1),
        Err(Ok(EscrowError::TooManyExtensions))
    );
    assert_eq!(client.get().extension_count, MAX_EXTENSIONS);
}

#[test]
fn create_emits_versioned_lifecycle_event() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    let events = env.events().all();
    let (_, topics, data) = events.last().unwrap();
    assert_eq!(topics.len(), 3);
    assert_eq!(topics.get(0).unwrap(), EVENT_VERSION.into_val(&env));
    assert_eq!(topics.get(1).unwrap(), Symbol::new(&env, "created").into_val(&env));
    assert_eq!(topics.get(2).unwrap(), depositor.clone().into_val(&env));
    let (amount, state): (i128, EscrowState) = data.into_val(&env);
    assert_eq!(amount, 100);
    assert_eq!(state, EscrowState::Created);
}

#[test]
fn release_emits_versioned_lifecycle_event() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.release();

    let events = env.events().all();
    let (_, topics, data) = events.last().unwrap();
    assert_eq!(topics.get(0).unwrap(), EVENT_VERSION.into_val(&env));
    assert_eq!(topics.get(1).unwrap(), Symbol::new(&env, "released").into_val(&env));
    assert_eq!(topics.get(2).unwrap(), beneficiary.clone().into_val(&env));
    let (amount, state): (i128, EscrowState) = data.into_val(&env);
    assert_eq!(amount, 100);
    assert_eq!(state, EscrowState::Released);
}

#[test]
fn cancel_emits_versioned_lifecycle_event() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.cancel();

    let events = env.events().all();
    let (_, topics, data) = events.last().unwrap();
    assert_eq!(topics.get(0).unwrap(), EVENT_VERSION.into_val(&env));
    assert_eq!(topics.get(1).unwrap(), Symbol::new(&env, "refunded").into_val(&env));
    assert_eq!(topics.get(2).unwrap(), depositor.clone().into_val(&env));
    let (amount, state): (i128, EscrowState) = data.into_val(&env);
    assert_eq!(amount, 100);
    assert_eq!(state, EscrowState::Cancelled);
}

#[test]
fn expire_emits_versioned_lifecycle_event() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 5));
    env.ledger().set_sequence_number(env.ledger().sequence() + 5);
    client.expire();

    let events = env.events().all();
    let (_, topics, data) = events.last().unwrap();
    assert_eq!(topics.get(0).unwrap(), EVENT_VERSION.into_val(&env));
    assert_eq!(topics.get(1).unwrap(), Symbol::new(&env, "refunded").into_val(&env));
    assert_eq!(topics.get(2).unwrap(), depositor.clone().into_val(&env));
    let (amount, state): (i128, EscrowState) = data.into_val(&env);
    assert_eq!(amount, 100);
    assert_eq!(state, EscrowState::Expired);
}
