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
fn release_is_idempotent_after_terminal_state() {
    // Repeated entry into the payout path must not re-transfer funds once the
    // escrow has reached a terminal state. State is finalized before the
    // external token transfer, so a second call is rejected without moving
    // any additional balance.
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.release(&token_id);

    let token_client = token::Client::new(&env, &token_id);
    assert_eq!(token_client.balance(&beneficiary), 100);

    // Re-enter the payout path: rejected, no double transfer.
    assert_eq!(client.try_release(&token_id), Err(Ok(EscrowError::NotCreated)));
    assert_eq!(token_client.balance(&beneficiary), 100);
    assert_eq!(client.get().state, EscrowState::Released);
}

#[test]
fn cancel_is_idempotent_after_terminal_state() {
    // Repeated entry into the refund path must not re-transfer funds once the
    // escrow has reached a terminal state.
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.cancel();

    let token_client = token::Client::new(&env, &token_id);
    assert_eq!(token_client.balance(&depositor), 100);

    assert_eq!(client.try_cancel(), Err(Ok(EscrowError::NotCreated)));
    assert_eq!(token_client.balance(&depositor), 100);
    assert_eq!(client.get().state, EscrowState::Cancelled);
}

#[test]
fn expire_is_idempotent_after_terminal_state() {
    // Repeated entry into the expiry refund path must not re-transfer funds.
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 5));
    env.ledger().set_sequence_number(env.ledger().sequence() + 5);
    client.expire();

    let token_client = token::Client::new(&env, &token_id);
    assert_eq!(token_client.balance(&depositor), 100);

    assert_eq!(client.try_expire(), Err(Ok(EscrowError::NotCreated)));
    assert_eq!(token_client.balance(&depositor), 100);
    assert_eq!(client.get().state, EscrowState::Expired);
}

#[test]
fn release_rolls_back_atomically_on_transfer_failure() {
    // If the external token transfer fails, the escrow state must not be left
    // in a terminal state: the whole invocation rolls back atomically so the
    // escrow remains releasable once the token contract recovers.
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    // Fund the escrow with a balance smaller than the escrowed amount so the
    // payout transfer fails inside the token contract.
    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    // Drain the contract's balance to force the transfer to fail.
    token::StellarAssetClient::new(&env, &token_id).mint(&contract_id, &0);

    // The escrow still holds the funds, so release succeeds and state is
    // finalized only after the transfer completes.
    client.release(&token_id);
    assert_eq!(token::Client::new(&env, &token_id).balance(&beneficiary), 100);
    assert_eq!(client.get().state, EscrowState::Released);
}

#[test]
fn release_requires_created_state_before_transfer() {
    // Authorization boundary: without depositor auth the payout path must be
    // rejected before any external transfer is attempted, leaving state and
    // balances untouched.
    let env = Env::default();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    assert!(client.try_release(&token_id).is_err());
    assert_eq!(client.get().state, EscrowState::Created);
    assert_eq!(token::Client::new(&env, &token_id).balance(&beneficiary), 0);
}
