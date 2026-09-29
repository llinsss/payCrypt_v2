//! Tests for token configuration versioning and legacy balance withdrawal.
//!
//! Issue #732: changing a supported token address must not strand existing
//! balances. These tests exercise the wallet contract's configuration
//! versioning and the guarantee that legacy assets remain withdrawable until
//! drained.

use soroban_sdk::{testutils::Address as _, Address, Env};

use wallet::{WalletContract, WalletContractClient};

/// Deploy the wallet contract and return a client plus the admin address.
fn setup(env: &Env) -> (WalletContractClient, Address) {
    let contract_id = env.register_contract(None, WalletContract);
    let client = WalletContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    (client, admin)
}

/// A token configuration change must bump the recorded configuration version
/// and record the effective ledger at which the change took effect.
#[test]
fn config_change_records_version_and_effective_ledger() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let token_a = Address::generate(&env);
    let token_b = Address::generate(&env);

    let v0 = client.config_version();
    client.set_supported_token(&admin, &token_a);
    let v1 = client.config_version();
    let ledger1 = client.effective_ledger();

    assert_eq!(v1, v0 + 1, "config version must increment on change");
    assert_eq!(ledger1, env.ledger().sequence(), "effective ledger must be recorded");

    client.set_supported_token(&admin, &token_b);
    let v2 = client.config_version();
    let ledger2 = client.effective_ledger();

    assert_eq!(v2, v1 + 1, "each replacement bumps the config version");
    assert!(ledger2 >= ledger1, "effective ledger must not move backwards");
}

/// Balances held under a previous token configuration must remain withdrawable
/// after the supported token address is replaced.
#[test]
fn legacy_balance_withdrawable_after_token_replacement() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let owner = Address::generate(&env);
    let legacy_token = Address::generate(&env);
    let new_token = Address::generate(&env);

    // Configure the legacy token and credit a balance against it.
    client.set_supported_token(&admin, &legacy_token);
    client.deposit(&owner, &legacy_token, &1_000);
    assert_eq!(client.balance(&owner, &legacy_token), 1_000);

    // Replace the supported token address.
    client.set_supported_token(&admin, &new_token);

    // The legacy balance must still be visible and withdrawable.
    assert_eq!(
        client.balance(&owner, &legacy_token),
        1_000,
        "legacy balance must survive a token replacement"
    );

    client.withdraw(&owner, &legacy_token, &1_000);
    assert_eq!(
        client.balance(&owner, &legacy_token),
        0,
        "legacy balance must be fully withdrawable until drained"
    );
}

/// After a replacement, new deposits go to the new token while the legacy
/// balance remains independently withdrawable.
#[test]
fn balances_before_and_after_replacement_are_independent() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, admin) = setup(&env);

    let owner = Address::generate(&env);
    let legacy_token = Address::generate(&env);
    let new_token = Address::generate(&env);

    client.set_supported_token(&admin, &legacy_token);
    client.deposit(&owner, &legacy_token, &500);

    client.set_supported_token(&admin, &new_token);
    client.deposit(&owner, &new_token, &250);

    assert_eq!(client.balance(&owner, &legacy_token), 500);
    assert_eq!(client.balance(&owner, &new_token), 250);

    // Draining the legacy balance must not affect the new token balance.
    client.withdraw(&owner, &legacy_token, &500);
    assert_eq!(client.balance(&owner, &legacy_token), 0);
    assert_eq!(client.balance(&owner, &new_token), 250);
}
