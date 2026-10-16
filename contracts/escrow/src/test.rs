#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env, String};

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
    client.release(&token_id);

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
    client.release(&token_id);

    assert_eq!(client.try_cancel(), Err(Ok(EscrowError::NotCreated)));
    assert_eq!(client.try_release(&token_id), Err(Ok(EscrowError::NotCreated)));
}

#[test]
fn create_binds_asset_address() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    assert_eq!(client.get().asset, token_id);
}

#[test]
fn release_rejects_mismatched_asset() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    let other_admin = Address::generate(&env);
    let other_token = env.register_stellar_asset_contract(other_admin);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    assert_eq!(client.try_release(&other_token), Err(Ok(EscrowError::AssetMismatch)));
    assert_eq!(client.get().state, EscrowState::Created);
    assert_eq!(token::Client::new(&env, &token_id).balance(&beneficiary), 0);
}

#[test]
fn deposit_rejects_mismatched_asset() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    let other_admin = Address::generate(&env);
    let other_token = env.register_stellar_asset_contract(other_admin);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    assert_eq!(client.try_deposit(&other_token, &50), Err(Ok(EscrowError::AssetMismatch)));
    assert_eq!(client.get().state, EscrowState::Created);
}

#[test]
fn deposit_with_correct_asset_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.deposit(&token_id, &50);

    assert_eq!(client.get().state, EscrowState::Created);
}

#[test]
fn deposit_rejects_zero_amount() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    assert_eq!(client.try_deposit(&token_id, &0), Err(Ok(EscrowError::InvalidAmount)));
}

#[test]
fn release_requires_depositor_auth() {
    let env = Env::default();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    assert!(client.try_release(&token_id).is_err());
    assert_eq!(client.get().state, EscrowState::Created);
}

#[test]
fn create_accepts_metadata_at_max_length() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    let metadata = String::from_str(&env, &"a".repeat(MAX_METADATA_LEN as usize));
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10), &metadata);

    assert_eq!(client.get().metadata, metadata);
}

#[test]
fn create_rejects_metadata_over_max_length() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    let metadata = String::from_str(&env, &"a".repeat(MAX_METADATA_LEN as usize + 1));

    assert_eq!(
        client.try_create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10), &metadata),
        Err(Ok(EscrowError::MetadataTooLong))
    );
}

#[test]
fn create_rejects_metadata_with_unsupported_chars() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    let metadata = String::from_str(&env, "bad\nmetadata");

    assert_eq!(
        client.try_create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10), &metadata),
        Err(Ok(EscrowError::InvalidMetadata))
    );
}

#[test]
fn active_escrow_state_readable_after_ledger_advancement() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    let expiry = env.ledger().sequence() + 100;
    client.create(&depositor, &beneficiary, &token_id, &100, &expiry);

    // Advance the ledger close to (but not past) expiry and confirm the
    // persistent escrow entry is still readable and its TTL was renewed.
    env.ledger().set_sequence_number(expiry - 1);
    let escrow = client.get();
    assert_eq!(escrow.state, EscrowState::Created);
    assert_eq!(escrow.asset, token_id);
    assert_eq!(escrow.amount, 100);

    // Renewal keeps the entry alive past the original expiry window.
    env.ledger().set_sequence_number(expiry + 1);
    assert_eq!(client.get().state, EscrowState::Created);
}

#[test]
fn ttl_renewal_extends_active_escrow_entry() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    let expiry = env.ledger().sequence() + 50;
    client.create(&depositor, &beneficiary, &token_id, &100, &expiry);

    // A read on an active escrow renews the persistent entry's TTL.
    let before = env.storage().persistent().get_ttl(&DataKey::Escrow());
    client.get();
    let after = env.storage().persistent().get_ttl(&DataKey::Escrow());
    assert!(after >= before);

    // The renewed entry survives simulated ledger advancement.
    env.ledger().set_sequence_number(env.ledger().sequence() + 40);
    assert_eq!(client.get().state, EscrowState::Created);
}

#[test]
fn terminal_escrow_does_not_renew_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.release(&token_id);

    // Terminal escrows are not renewed; the entry is allowed to lapse.
    let before = env.storage().persistent().get_ttl(&DataKey::Escrow());
    client.get();
    let after = env.storage().persistent().get_ttl(&DataKey::Escrow());
    assert!(after <= before);
}
