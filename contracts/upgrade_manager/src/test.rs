#![cfg(test)]

extern crate std;

use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, Vec};

use crate::{UpgradeManager, UpgradeManagerClient, UpgradeStatus};

fn setup() -> (Env, UpgradeManagerClient<'static>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, UpgradeManager);
    let client = UpgradeManagerClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let governance = Address::generate(&env);
    client.initialize(&admin, &governance);
    (env, client, admin, governance)
}

fn hash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

#[test]
fn propose_requires_authorized_governance() {
    let (env, client, _admin, governance) = setup();
    let impl_hash = hash(&env, 1);

    // Authorized governance can propose.
    let version = client.propose_upgrade(&governance, &impl_hash);
    assert_eq!(version, 1);
    assert_eq!(client.get_status(&version), UpgradeStatus::Proposed);

    // Unauthorized caller cannot propose.
    let stranger = Address::generate(&env);
    let result = client.try_propose_upgrade(&stranger, &hash(&env, 2));
    assert!(result.is_err());
}

#[test]
fn approve_validates_authorized_implementation_hash() {
    let (env, client, _admin, governance) = setup();
    let impl_hash = hash(&env, 3);
    let version = client.propose_upgrade(&governance, &impl_hash);

    // Approving with a mismatched hash is rejected.
    let bad = client.try_approve_upgrade(&governance, &version, &hash(&env, 4));
    assert!(bad.is_err());

    // Approving with the authorized hash succeeds.
    client.approve_upgrade(&governance, &version, &impl_hash);
    assert_eq!(client.get_status(&version), UpgradeStatus::Approved);
}

#[test]
fn execute_requires_approval_and_authorized_hash() {
    let (env, client, _admin, governance) = setup();
    let impl_hash = hash(&env, 5);
    let version = client.propose_upgrade(&governance, &impl_hash);

    // Cannot execute before approval.
    let early = client.try_execute_upgrade(&governance, &version, &impl_hash);
    assert!(early.is_err());

    client.approve_upgrade(&governance, &version, &impl_hash);

    // Unauthorized caller cannot execute.
    let stranger = Address::generate(&env);
    let unauthorized = client.try_execute_upgrade(&stranger, &version, &impl_hash);
    assert!(unauthorized.is_err());

    // Authorized governance executes the approved version.
    client.execute_upgrade(&governance, &version, &impl_hash);
    assert_eq!(client.get_status(&version), UpgradeStatus::Executed);
    assert_eq!(client.get_current_version(), version);
}

#[test]
fn cancel_records_cancelled_version() {
    let (env, client, _admin, governance) = setup();
    let impl_hash = hash(&env, 6);
    let version = client.propose_upgrade(&governance, &impl_hash);

    client.cancel_upgrade(&governance, &version);
    assert_eq!(client.get_status(&version), UpgradeStatus::Cancelled);

    // Cancelled versions cannot be approved or executed.
    assert!(client.try_approve_upgrade(&governance, &version, &impl_hash).is_err());
    assert!(client.try_execute_upgrade(&governance, &version, &impl_hash).is_err());
}

#[test]
fn replay_of_executed_version_is_rejected() {
    let (env, client, _admin, governance) = setup();
    let impl_hash = hash(&env, 7);
    let version = client.propose_upgrade(&governance, &impl_hash);
    client.approve_upgrade(&governance, &version, &impl_hash);
    client.execute_upgrade(&governance, &version, &impl_hash);

    // Re-executing the same version must fail (replay protection).
    let replay = client.try_execute_upgrade(&governance, &version, &impl_hash);
    assert!(replay.is_err());

    // Re-approving an executed version must also fail.
    let reapprove = client.try_approve_upgrade(&governance, &version, &impl_hash);
    assert!(reapprove.is_err());
}

#[test]
fn rollback_only_to_previously_executed_version() {
    let (env, client, _admin, governance) = setup();

    let v1_hash = hash(&env, 8);
    let v1 = client.propose_upgrade(&governance, &v1_hash);
    client.approve_upgrade(&governance, &v1, &v1_hash);
    client.execute_upgrade(&governance, &v1, &v1_hash);

    let v2_hash = hash(&env, 9);
    let v2 = client.propose_upgrade(&governance, &v2_hash);
    client.approve_upgrade(&governance, &v2, &v2_hash);
    client.execute_upgrade(&governance, &v2, &v2_hash);
    assert_eq!(client.get_current_version(), v2);

    // Rolling back to a never-executed version is rejected.
    let v3_hash = hash(&env, 10);
    let v3 = client.propose_upgrade(&governance, &v3_hash);
    assert!(client.try_rollback_upgrade(&governance, &v3).is_err());

    // Unauthorized caller cannot roll back.
    let stranger = Address::generate(&env);
    assert!(client.try_rollback_upgrade(&stranger, &v1).is_err());

    // Authorized governance rolls back to a previously executed version.
    client.rollback_upgrade(&governance, &v1);
    assert_eq!(client.get_current_version(), v1);
    assert_eq!(client.get_status(&v1), UpgradeStatus::Executed);
}

#[test]
fn version_history_records_all_states() {
    let (env, client, _admin, governance) = setup();

    let proposed = client.propose_upgrade(&governance, &hash(&env, 11));
    let approved = client.propose_upgrade(&governance, &hash(&env, 12));
    client.approve_upgrade(&governance, &approved, &hash(&env, 12));
    let executed = client.propose_upgrade(&governance, &hash(&env, 13));
    client.approve_upgrade(&governance, &executed, &hash(&env, 13));
    client.execute_upgrade(&governance, &executed, &hash(&env, 13));
    let cancelled = client.propose_upgrade(&governance, &hash(&env, 14));
    client.cancel_upgrade(&governance, &cancelled);

    assert_eq!(client.get_status(&proposed), UpgradeStatus::Proposed);
    assert_eq!(client.get_status(&approved), UpgradeStatus::Approved);
    assert_eq!(client.get_status(&executed), UpgradeStatus::Executed);
    assert_eq!(client.get_status(&cancelled), UpgradeStatus::Cancelled);

    let history: Vec<u32> = client.get_version_history();
    assert_eq!(history.len(), 4);
}
