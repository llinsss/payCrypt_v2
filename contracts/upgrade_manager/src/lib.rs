#![no_std]

//! Versioned Rust/Soroban upgrade manager.
//!
//! Replaces the generic upgrade request with an explicit manager that:
//! - requires authorized governance for every state transition,
//! - validates authorized implementation hashes before approval/execution,
//! - records proposed, approved, executed, and cancelled versions,
//! - enforces rollback rules (only to previously approved/executed versions).

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, BytesN, Env, Vec};

/// Lifecycle state of a proposed upgrade version.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UpgradeState {
    Proposed,
    Approved,
    Executed,
    Cancelled,
}

/// A single recorded upgrade version and its lifecycle state.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeRecord {
    pub version: u32,
    pub implementation: BytesN<32>,
    pub state: UpgradeState,
    pub proposed_by: Address,
    pub approved_by: Option<Address>,
    pub executed_by: Option<Address>,
    pub cancelled_by: Option<Address>,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum UpgradeError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    UnknownVersion = 4,
    InvalidState = 5,
    UnauthorizedImplementation = 6,
    DuplicateVersion = 7,
    NoRollbackTarget = 8,
    InvalidRollbackTarget = 9,
}

#[contracttype]
#[derive(Clone)]
pub struct UpgradeManagerKey;

#[contracttype]
#[derive(Clone)]
pub struct GovernanceKey;

#[contracttype]
#[derive(Clone)]
pub struct AuthorizedImplKey;

#[contracttype]
#[derive(Clone)]
pub struct VersionKey {
    pub version: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct CurrentVersionKey;

#[contracttype]
#[derive(Clone)]
pub struct VersionListKey;

#[contract]
pub struct UpgradeManager;

#[contractimpl]
impl UpgradeManager {
    /// Initialize the manager with the authorized governance address.
    pub fn initialize(env: Env, governance: Address) -> Result<(), UpgradeError> {
        if env.storage().instance().has(&GovernanceKey) {
            return Err(UpgradeError::AlreadyInitialized);
        }
        env.storage().instance().set(&GovernanceKey, &governance);
        env.storage().instance().set(&CurrentVersionKey, &0u32);
        env.storage().instance().set(&VersionListKey, &Vec::<u32>::new(&env));
        Ok(())
    }

    /// Authorize an implementation hash so it may be proposed/approved/executed.
    pub fn authorize_implementation(
        env: Env,
        governance: Address,
        implementation: BytesN<32>,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        env.storage()
            .persistent()
            .set(&AuthorizedImplKey, &implementation);
        Ok(())
    }

    /// Propose a new upgrade version pointing at an authorized implementation hash.
    pub fn propose_upgrade(
        env: Env,
        governance: Address,
        version: u32,
        implementation: BytesN<32>,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        Self::require_authorized_impl(&env, &implementation)?;

        let key = VersionKey { version };
        if env.storage().persistent().has(&key) {
            return Err(UpgradeError::DuplicateVersion);
        }

        let record = UpgradeRecord {
            version,
            implementation,
            state: UpgradeState::Proposed,
            proposed_by: governance.clone(),
            approved_by: None,
            executed_by: None,
            cancelled_by: None,
        };
        env.storage().persistent().set(&key, &record);

        let mut versions: Vec<u32> = env
            .storage()
            .instance()
            .get(&VersionListKey)
            .unwrap_or_else(|| Vec::new(&env));
        versions.push_back(version);
        env.storage().instance().set(&VersionListKey, &versions);
        Ok(())
    }

    /// Approve a proposed version. Only authorized governance may approve.
    pub fn approve_upgrade(
        env: Env,
        governance: Address,
        version: u32,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        let key = VersionKey { version };
        let mut record: UpgradeRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(UpgradeError::UnknownVersion)?;

        if record.state != UpgradeState::Proposed {
            return Err(UpgradeError::InvalidState);
        }
        Self::require_authorized_impl(&env, &record.implementation)?;

        record.state = UpgradeState::Approved;
        record.approved_by = Some(governance);
        env.storage().persistent().set(&key, &record);
        Ok(())
    }

    /// Execute an approved version, making it the current version.
    pub fn execute_upgrade(
        env: Env,
        governance: Address,
        version: u32,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        let key = VersionKey { version };
        let mut record: UpgradeRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(UpgradeError::UnknownVersion)?;

        if record.state != UpgradeState::Approved {
            return Err(UpgradeError::InvalidState);
        }
        Self::require_authorized_impl(&env, &record.implementation)?;

        record.state = UpgradeState::Executed;
        record.executed_by = Some(governance);
        env.storage().persistent().set(&key, &record);
        env.storage().instance().set(&CurrentVersionKey, &version);
        Ok(())
    }

    /// Cancel a proposed or approved version. Executed versions cannot be cancelled.
    pub fn cancel_upgrade(
        env: Env,
        governance: Address,
        version: u32,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        let key = VersionKey { version };
        let mut record: UpgradeRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(UpgradeError::UnknownVersion)?;

        match record.state {
            UpgradeState::Proposed | UpgradeState::Approved => {}
            _ => return Err(UpgradeError::InvalidState),
        }

        record.state = UpgradeState::Cancelled;
        record.cancelled_by = Some(governance);
        env.storage().persistent().set(&key, &record);
        Ok(())
    }

    /// Roll back to a previously approved or executed version.
    ///
    /// Rollback rules: the target must exist, must have been approved or
    /// executed, must not be cancelled, and the caller must be authorized
    /// governance. The current version is set back to the target.
    pub fn rollback_upgrade(
        env: Env,
        governance: Address,
        target_version: u32,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;

        let current: u32 = env
            .storage()
            .instance()
            .get(&CurrentVersionKey)
            .unwrap_or(0);
        if target_version == current {
            return Err(UpgradeError::InvalidRollbackTarget);
        }

        let key = VersionKey {
            version: target_version,
        };
        let record: UpgradeRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(UpgradeError::NoRollbackTarget)?;

        match record.state {
            UpgradeState::Approved | UpgradeState::Executed => {}
            _ => return Err(UpgradeError::InvalidRollbackTarget),
        }
        Self::require_authorized_impl(&env, &record.implementation)?;

        env.storage()
            .instance()
            .set(&CurrentVersionKey, &target_version);
        Ok(())
    }

    /// Read a recorded version.
    pub fn get_version(env: Env, version: u32) -> Result<UpgradeRecord, UpgradeError> {
        env.storage()
            .persistent()
            .get(&VersionKey { version })
            .ok_or(UpgradeError::UnknownVersion)
    }

    /// Current active version.
    pub fn current_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&CurrentVersionKey)
            .unwrap_or(0)
    }

    /// All recorded versions in proposal order.
    pub fn versions(env: Env) -> Vec<u32> {
        env.storage()
            .instance()
            .get(&VersionListKey)
            .unwrap_or_else(|| Vec::new(&env))
    }

    fn require_governance(env: &Env, caller: &Address) -> Result<(), UpgradeError> {
        let governance: Address = env
            .storage()
            .instance()
            .get(&GovernanceKey)
            .ok_or(UpgradeError::NotInitialized)?;
        caller.require_auth();
        if &governance != caller {
            return Err(UpgradeError::Unauthorized);
        }
        Ok(())
    }

    fn require_authorized_impl(env: &Env, implementation: &BytesN<32>) -> Result<(), UpgradeError> {
        let authorized: BytesN<32> = env
            .storage()
            .persistent()
            .get(&AuthorizedImplKey)
            .ok_or(UpgradeError::UnauthorizedImplementation)?;
        if &authorized != implementation {
            return Err(UpgradeError::UnauthorizedImplementation);
        }
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup(env: &Env) -> (UpgradeManagerClient, Address, BytesN<32>) {
        env.mock_all_auths();
        let contract_id = env.register_contract(None, UpgradeManager);
        let client = UpgradeManagerClient::new(env, &contract_id);
        let governance = Address::generate(env);
        client.initialize(&governance);
        let impl_hash = BytesN::from_array(env, &[7u8; 32]);
        client.authorize_implementation(&governance, &impl_hash);
        (client, governance, impl_hash)
    }

    #[test]
    fn full_lifecycle_records_states() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        client.propose_upgrade(&gov, &1, &hash);
        assert_eq!(client.get_version(&1).state, UpgradeState::Proposed);

        client.approve_upgrade(&gov, &1);
        assert_eq!(client.get_version(&1).state, UpgradeState::Approved);

        client.execute_upgrade(&gov, &1);
        assert_eq!(client.get_version(&1).state, UpgradeState::Executed);
        assert_eq!(client.current_version(), 1);
    }

    #[test]
    fn cancel_records_cancelled_state() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash);
        client.cancel_upgrade(&gov, &1);
        assert_eq!(client.get_version(&1).state, UpgradeState::Cancelled);
    }

    #[test]
    fn replay_is_rejected() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);
        // Replaying execute on an already executed version must fail.
        assert_eq!(
            client.try_execute_upgrade(&gov, &1),
            Err(Ok(UpgradeError::InvalidState))
        );
        // Re-proposing the same version must fail.
        assert_eq!(
            client.try_propose_upgrade(&gov, &1, &hash),
            Err(Ok(UpgradeError::DuplicateVersion))
        );
    }

    #[test]
    fn unauthorized_execution_is_rejected() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash);
        client.approve_upgrade(&gov, &1);

        let attacker = Address::generate(&env);
        assert_eq!(
            client.try_execute_upgrade(&attacker, &1),
            Err(Ok(UpgradeError::Unauthorized))
        );
    }

    #[test]
    fn unauthorized_implementation_is_rejected() {
        let env = Env::default();
        let (client, gov, _hash) = setup(&env);
        let rogue = BytesN::from_array(&env, &[9u8; 32]);
        assert_eq!(
            client.try_propose_upgrade(&gov, &2, &rogue),
            Err(Ok(UpgradeError::UnauthorizedImplementation))
        );
    }

    #[test]
    fn rollback_to_previous_executed_version() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        client.propose_upgrade(&gov, &1, &hash);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        client.propose_upgrade(&gov, &2, &hash);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &2);
        assert_eq!(client.current_version(), 2);

        client.rollback_upgrade(&gov, &1);
        assert_eq!(client.current_version(), 1);
    }

    #[test]
    fn rollback_to_cancelled_version_is_rejected() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash);
        client.cancel_upgrade(&gov, &1);
        assert_eq!(
            client.try_rollback_upgrade(&gov, &1),
            Err(Ok(UpgradeError::InvalidRollbackTarget))
        );
    }
}
