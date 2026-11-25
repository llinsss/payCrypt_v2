use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::StellarAssetClient,
    Address, Env, Vec,
};
use wallet_contract::{WalletContract, WalletContractClient};

fn setup_wallet(env: &Env, threshold: u32) -> (WalletContractClient<'_>, Address, Address, Address, Address) {
    env.mock_all_auths();
    let admin = Address::generate(env);
    let signer_a = Address::generate(env);
    let signer_b = Address::generate(env);
    let destination = Address::generate(env);
    let wallet_id = env.register(WalletContract, ());
    let wallet = WalletContractClient::new(env, &wallet_id);
    let signers = Vec::from_array(env, [signer_a.clone(), signer_b.clone()]);
    wallet.initialize(&admin, &signers, &threshold, &100, &false);
    (wallet, admin, signer_a, signer_b, destination)
}

fn mint_token(env: &Env, wallet: &WalletContractClient, admin: &Address, amount: i128) -> Address {
    let token_admin = Address::generate(env);
    let token = env.register_stellar_asset_contract_v2(token_admin).address();
    wallet.set_token_supported(admin, &token, &true);
    StellarAssetClient::new(env, &token).mint(&wallet.address, &amount);
    token
}

#[test]
fn withdrawal_conserves_token_balance() {
    let env = Env::default();
    let (wallet, admin, signer_a, _signer_b, destination) = setup_wallet(&env, 1);
    let token = mint_token(&env, &wallet, &admin, 50);
    let tc = soroban_sdk::token::Client::new(&env, &token);
    env.ledger().set_timestamp(100);
    let wallet_before = tc.balance(&wallet.address);
    let dest_before = tc.balance(&destination);
    let amount: i128 = 25;
    let pid = wallet.propose_withdrawal(&signer_a, &token, &destination, &amount, &2000);
    wallet.execute(&signer_a, &pid);
    assert_eq!(tc.balance(&wallet.address), wallet_before - amount);
    assert_eq!(tc.balance(&destination), dest_before + amount);
    assert_eq!(tc.balance(&wallet.address) + tc.balance(&destination), wallet_before + dest_before);
}

#[test]
fn sequential_withdrawals_conserve_balance() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup_wallet(&env, 1);
    let token = mint_token(&env, &wallet, &admin, 50);
    let tc = soroban_sdk::token::Client::new(&env, &token);
    env.ledger().set_timestamp(100);
    let wallet_before = tc.balance(&wallet.address);
    let p1 = wallet.propose_withdrawal(&signer_a, &token, &destination, &10, &2000);
    wallet.execute(&signer_a, &p1);
    let p2 = wallet.propose_withdrawal(&signer_b, &token, &destination, &15, &2000);
    wallet.execute(&signer_b, &p2);
    assert_eq!(tc.balance(&wallet.address), wallet_before - 25);
    assert_eq!(tc.balance(&destination), 25);
}

#[test]
fn failed_withdrawal_does_not_change_balance() {
    let env = Env::default();
    let (wallet, admin, signer_a, _signer_b, destination) = setup_wallet(&env, 2);
    let token = mint_token(&env, &wallet, &admin, 50);
    let tc = soroban_sdk::token::Client::new(&env, &token);
    env.ledger().set_timestamp(100);
    let wallet_before = tc.balance(&wallet.address);
    let dest_before = tc.balance(&destination);
    let pid = wallet.propose_withdrawal(&signer_a, &token, &destination, &25, &2000);
    let _ = wallet.try_execute(&signer_a, &pid);
    assert_eq!(tc.balance(&wallet.address), wallet_before);
    assert_eq!(tc.balance(&destination), dest_before);
}
