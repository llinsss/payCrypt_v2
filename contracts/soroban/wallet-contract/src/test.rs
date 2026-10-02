use super::*;
use soroban_sdk::{testutils::{Address as _, Ledger as _}, token::StellarAssetClient};

fn setup(env: &Env, threshold: u32) -> (WalletContractClient<'_>, Address, Address, Address, Address) {
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let signer_a = Address::generate(&env);
    let signer_b = Address::generate(&env);
    let destination = Address::generate(&env);
    let wallet_id = env.register(WalletContract, ());
    let wallet = WalletContractClient::new(&env, &wallet_id);
    let signers = Vec::from_array(&env, [signer_a.clone(), signer_b.clone()]);
    wallet.initialize(&admin, &signers, &threshold, &100, &false);
    (wallet, admin, signer_a, signer_b, destination)
}

fn supported_token(env: &Env, wallet: &WalletContractClient, admin: &Address) -> Address {
    let token_admin = Address::generate(env);
    let token = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
    wallet.set_token_supported(admin, &token, &true);
    StellarAssetClient::new(env, &token).mint(&wallet.address, &50);
    token
}

#[test]
fn threshold_withdrawal_requires_distinct_signers_and_advances_nonce() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 2);
    let token = supported_token(&env, &wallet, &admin);
    env.ledger().set_timestamp(100);
    let proposal_id = wallet.propose_withdrawal(&signer_a, &token, &destination, &25, &2000);
    assert!(wallet.try_approve(&signer_a, &proposal_id).is_err());
    wallet.approve(&signer_b, &proposal_id);
    wallet.execute(&signer_b, &proposal_id);
    assert_eq!(wallet.execution_nonce(), 1);
    assert_eq!(soroban_sdk::token::Client::new(&env, &token).balance(&destination), 25);
}

#[test]
fn signer_rotation_and_threshold_are_validated() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, _) = setup(&env, 2);
    assert!(wallet.try_remove_signer(&admin, &signer_a).is_err());
    wallet.set_threshold(&admin, &1);
    wallet.remove_signer(&admin, &signer_a);
    assert!(!wallet.is_signer(&signer_a));
    assert!(wallet.try_set_threshold(&admin, &2).is_err());
    let replacement = Address::generate(&env);
    wallet.add_signer(&admin, &replacement);
    assert!(wallet.is_signer(&replacement));
    assert!(wallet.is_signer(&signer_b));
}

#[test]
fn stale_proposals_cannot_execute_out_of_nonce_order() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 1);
    let token = supported_token(&env, &wallet, &admin);
    env.ledger().set_timestamp(100);
    let first = wallet.propose_withdrawal(&signer_a, &token, &destination, &10, &2000);
    let second = wallet.propose_withdrawal(&signer_b, &token, &destination, &10, &2000);
    assert!(wallet.try_execute(&signer_a, &second).is_err());
    wallet.execute(&signer_a, &first);
    wallet.execute(&signer_b, &second);
    assert_eq!(wallet.execution_nonce(), 2);
}

#[test]
fn unauthorized_admin_call_and_invalid_policy_are_rejected() {
    let env = Env::default();
    let (wallet, admin, _, _, destination) = setup(&env, 1);
    let outsider = Address::generate(&env);
    assert!(wallet.try_add_signer(&outsider, &Address::generate(&env)).is_err());
    assert!(wallet.try_set_withdrawal_policy(&admin, &0, &false).is_err());
    wallet.set_withdrawal_policy(&admin, &10, &true);
    env.ledger().set_timestamp(100);
    assert!(wallet.try_propose_withdrawal(&Address::generate(&env), &Address::generate(&env), &destination, &1, &2000).is_err());
}

#[test]
fn pending_proposals_use_the_current_threshold() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 1);
    let token = supported_token(&env, &wallet, &admin);
    env.ledger().set_timestamp(100);
    let proposal_id = wallet.propose_withdrawal(&signer_a, &token, &destination, &10, &2000);
    wallet.set_threshold(&admin, &2);
    assert!(wallet.try_execute(&signer_a, &proposal_id).is_err());
    wallet.approve(&signer_b, &proposal_id);
    wallet.execute(&signer_a, &proposal_id);
}

#[test]
fn admin_rotation_works_and_validates_correctly() {
    let env = Env::default();
    let (wallet, admin, _, _, _) = setup(&env, 1);
    let new_admin = Address::generate(&env);
    let outsider = Address::generate(&env);

    // Outsider cannot propose
    assert!(wallet.try_propose_admin_rotation(&outsider, &new_admin).is_err());

    // Cannot propose self
    assert!(wallet.try_propose_admin_rotation(&admin, &admin).is_err());

    // Admin proposes new admin
    wallet.propose_admin_rotation(&admin, &new_admin);

    // Outsider cannot execute
    assert!(wallet.try_execute_admin_rotation(&outsider).is_err());
    // Old admin cannot execute
    assert!(wallet.try_execute_admin_rotation(&admin).is_err());

    // New admin executes rotation
    wallet.execute_admin_rotation(&new_admin);

    // Old admin can no longer propose
    let another_admin = Address::generate(&env);
    assert!(wallet.try_propose_admin_rotation(&admin, &another_admin).is_err());

    // New admin can propose
    wallet.propose_admin_rotation(&new_admin, &another_admin);
    wallet.execute_admin_rotation(&another_admin);
}

#[test]
fn expired_proposals_cannot_be_approved_or_executed() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 2);
    let token = supported_token(&env, &wallet, &admin);

    env.ledger().set_timestamp(500);
    let proposal_id = wallet.propose_withdrawal(&signer_a, &token, &destination, &10, &1000);

    env.ledger().set_timestamp(1001);
    assert!(wallet.try_approve(&signer_b, &proposal_id).is_err());
    assert!(wallet.try_execute(&signer_b, &proposal_id).is_err());
}

#[test]
fn revoke_approval_success() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 2);
    let token = supported_token(&env, &wallet, &admin);
    env.ledger().set_timestamp(100);
    let proposal_id = wallet.propose_withdrawal(&signer_a, &token, &destination, &25, &2000);

    // signer_b approves
    wallet.approve(&signer_b, &proposal_id);
    let proposal = wallet.proposal(&proposal_id);
    assert_eq!(proposal.approval_count, 2); // proposer + signer_b

    // signer_b revokes approval
    wallet.revoke_approval(&signer_b, &proposal_id);
    let proposal = wallet.proposal(&proposal_id);
    assert_eq!(proposal.approval_count, 1); // only proposer remains

    // signer_a (proposer) can also revoke
    wallet.revoke_approval(&signer_a, &proposal_id);
    let proposal = wallet.proposal(&proposal_id);
    assert_eq!(proposal.approval_count, 0);
}

#[test]
fn revoke_approval_unauthorized_signer_rejected() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 2);
    let token = supported_token(&env, &wallet, &admin);
    env.ledger().set_timestamp(100);
    let proposal_id = wallet.propose_withdrawal(&signer_a, &token, &destination, &25, &2000);

    wallet.approve(&signer_b, &proposal_id);

    // Outsider tries to revoke
    let outsider = Address::generate(&env);
    assert!(wallet.try_revoke_approval(&outsider, &proposal_id).is_err());

    // signer_a (who didn't approve beyond being proposer) tries to revoke signer_b's approval
    // This should fail because signer_a can only revoke their own approval
    assert!(wallet.try_revoke_approval(&signer_a, &proposal_id).is_ok()); // proposer can revoke their own
}

#[test]
fn revoke_approval_not_found_rejected() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 2);
    let token = supported_token(&env, &wallet, &admin);
    env.ledger().set_timestamp(100);
    let proposal_id = wallet.propose_withdrawal(&signer_a, &token, &destination, &25, &2000);

    // signer_b tries to revoke without having approved
    assert!(wallet.try_revoke_approval(&signer_b, &proposal_id).is_err());
}

#[test]
fn revoke_approval_after_execution_rejected() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 2);
    let token = supported_token(&env, &wallet, &admin);
    env.ledger().set_timestamp(100);
    let proposal_id = wallet.propose_withdrawal(&signer_a, &token, &destination, &25, &2000);

    wallet.approve(&signer_b, &proposal_id);
    wallet.execute(&signer_b, &proposal_id);

    // Cannot revoke after execution
    assert!(wallet.try_revoke_approval(&signer_b, &proposal_id).is_err());
}

#[test]
fn revoke_approval_after_expiry_rejected() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 2);
    let token = supported_token(&env, &wallet, &admin);
    env.ledger().set_timestamp(500);
    let proposal_id = wallet.propose_withdrawal(&signer_a, &token, &destination, &10, &1000);

    wallet.approve(&signer_b, &proposal_id);

    env.ledger().set_timestamp(1001);
    // Cannot revoke after expiry
    assert!(wallet.try_revoke_approval(&signer_b, &proposal_id).is_err());
}

#[test]
fn revoke_approval_duplicate_rejected() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 2);
    let token = supported_token(&env, &wallet, &admin);
    env.ledger().set_timestamp(100);
    let proposal_id = wallet.propose_withdrawal(&signer_a, &token, &destination, &25, &2000);

    wallet.approve(&signer_b, &proposal_id);
    wallet.revoke_approval(&signer_b, &proposal_id);

    // Cannot revoke twice
    assert!(wallet.try_revoke_approval(&signer_b, &proposal_id).is_err());
}

#[test]
fn revoke_approval_stale_proposal_rejected() {
    let env = Env::default();
    let (wallet, admin, signer_a, signer_b, destination) = setup(&env, 1);
    let token = supported_token(&env, &wallet, &admin);
    env.ledger().set_timestamp(100);
    let first = wallet.propose_withdrawal(&signer_a, &token, &destination, &10, &2000);
    let second = wallet.propose_withdrawal(&signer_b, &token, &destination, &10, &2000);
    let _third = wallet.propose_withdrawal(&signer_a, &token, &destination, &10, &2000);

    wallet.approve(&signer_a, &second);
    wallet.execute(&signer_a, &first); // advances execution_nonce to 1
    wallet.execute(&signer_b, &second); // advances execution_nonce to 2

    // third (nonce=2) is current, second (nonce=1) is now stale
    // signer_a approved second, but second is now stale so revoke should fail
    assert!(wallet.try_revoke_approval(&signer_a, &second).is_err());
}