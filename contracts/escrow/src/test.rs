#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env};

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
