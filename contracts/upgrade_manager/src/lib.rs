#![no_std]

//! Versioned Rust/Soroban upgrade manager.
//!
//! Replaces the generic upgrade request with an explicit manager that:
//! - requires authorized governance for every state transition,
//! - validates authorized implementation hashes before approval/execution,
//! - records proposed, approved, executed, and cancelled versions,
//! - bounds every proposal with a fixed validity window
//!   ([`PROPOSAL_EXPIRY_SECS`]) after which it can no longer be approved or
//!   executed,
//! - records a persistent state schema per version and only rolls back to
//!   versions whose schema can still read the current persistent state,
//! - enforces rollback rules (only to previously approved/executed versions)
//!   with a bounded reason string and emits a versioned rollback event.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, BytesN, Env, String, Vec};

use crate::events::{
    emit_approval_revoked, emit_execution, emit_migration_completed, emit_rollback,
    MAX_ROLLBACK_REASON_LEN,
};

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
    /// Ledger timestamp at which the proposal's validity window elapses
    /// (`proposal time + [`PROPOSAL_EXPIRY_SECS`]`). Once
    /// `ledger.timestamp() >= expires_at` the proposal can no longer be
    /// approved or executed. Executed versions and cancelled proposals are
    /// unaffected by expiry.
    pub expires_at: u64,
    /// Persistent state schema this version's implementation can read and
    /// write. Set at proposal time and never changed afterwards.
    pub state_schema: u32,
}

/// Current on-disk representation of an upgrade record.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VersionedUpgradeRecord {
    pub schema_version: u32,
    pub expected_current_version: u32,
    pub expected_current_revision: u64,
    pub record: UpgradeRecord,
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
    /// The supplied rollback reason exceeds the maximum allowed length
    /// ([`MAX_ROLLBACK_REASON_LEN`]). No state is mutated when this is
    /// returned.
    RollbackReasonTooLong = 10,
    /// The supplied implementation hash is empty (all zeros) or malformed.
    /// No state is mutated when this is returned.
    InvalidImplementation = 11,
    /// The proposal's bounded validity window has elapsed
    /// (`ledger.timestamp() >= expires_at`), so it can no longer be approved
    /// or executed. No state is mutated when this is returned. The proposal
    /// may still be queried or cancelled.
    ProposalExpired = 12,
    /// The rollback target's `state_schema` is older than the persistent
    /// state schema already written by an executed version, so it cannot
    /// safely read the current state. No state is mutated when this is
    /// returned.
    IncompatibleRollbackTarget = 13,
    /// Another upgrade or rollback changed the current version after this
    /// proposal was created. The record remains approved and can be reviewed.
    ExecutionConflict = 14,
    /// Mutating upgrade calls are disabled until legacy records are migrated.
    StorageMigrationRequired = 15,
    /// A storage migration batch must be between 1 and
    /// [`MAX_MIGRATION_BATCH_SIZE`] records.
    InvalidMigrationLimit = 16,
    /// The stored schema version is newer than this contract supports.
    UnsupportedStorageSchema = 17,
    /// A legacy version listed for migration has no corresponding record.
    MigrationRecordMissing = 18,
    /// The monotonic execution revision cannot be incremented further.
    ExecutionRevisionOverflow = 19,
    /// The bounded version history has reached its configured maximum.
    VersionHistoryFull = 20,
}

/// Validity window (in ledger seconds) granted to every upgrade proposal.
///
/// The window is fixed at proposal time and never extended: a proposal is
/// valid while `expires_at = proposed_at + PROPOSAL_EXPIRY_SECS` is strictly
/// in the future (`ledger.timestamp() < expires_at`). Keeping the window
/// fixed and bounded means storage growth per proposal stays constant (one
/// `expires_at: u64` field) and per-invocation work never grows with the age
/// of a proposal.
pub const PROPOSAL_EXPIRY_SECS: u64 = 30 * 24 * 60 * 60;

/// Current schema for versioned upgrade records.
pub const STORAGE_SCHEMA_VERSION: u32 = 2;

/// Maximum number of legacy version records migrated by one invocation.
pub const MAX_MIGRATION_BATCH_SIZE: u32 = 50;

/// Maximum number of upgrade versions retained in instance storage.
pub const MAX_RECORDED_VERSIONS: u32 = 1_000;

#[contracttype]
#[derive(Clone)]
pub enum UpgradeManagerKey {
    Key,
}

#[contracttype]
#[derive(Clone)]
pub enum GovernanceKey {
    Key,
}

#[contracttype]
#[derive(Clone)]
pub enum AuthorizedImplKey {
    Key,
}

#[contracttype]
#[derive(Clone)]
pub struct VersionKey {
    pub version: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct VersionedRecordKey {
    pub version: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum CurrentVersionKey {
    Key,
}

#[contracttype]
#[derive(Clone)]
pub enum CurrentVersionRevisionKey {
    Key,
}

#[contracttype]
#[derive(Clone)]
pub enum VersionListKey {
    Key,
}

#[contracttype]
#[derive(Clone)]
pub enum StorageSchemaVersionKey {
    Key,
}

#[contracttype]
#[derive(Clone)]
pub enum MigrationCursorKey {
    Key,
}

#[contract]
pub struct UpgradeManager;

pub mod events;

#[contractimpl]
impl UpgradeManager {
    /// Initialize the manager with the authorized governance address.
    pub fn initialize(env: Env, governance: Address) -> Result<(), UpgradeError> {
        if env.storage().instance().has(&GovernanceKey::Key) {
            return Err(UpgradeError::AlreadyInitialized);
        }
        env.storage().instance().set(&GovernanceKey::Key, &governance);
        env.storage().instance().set(&CurrentVersionKey::Key, &0u32);
        env.storage()
            .instance()
            .set(&CurrentVersionRevisionKey::Key, &0u64);
        env.storage()
            .instance()
            .set(&VersionListKey::Key, &Vec::<u32>::new(&env));
        env.storage()
            .instance()
            .set(&StorageSchemaVersionKey::Key, &STORAGE_SCHEMA_VERSION);
        Ok(())
    }

    /// Authorize an implementation hash so it may be proposed/approved/executed.
    ///
    /// The hash must be a non-empty, non-zero 32-byte value. An all-zero
    /// (empty) hash is rejected with [`UpgradeError::InvalidImplementation`]
    /// and no state is mutated.
    pub fn authorize_implementation(
        env: Env,
        governance: Address,
        implementation: BytesN<32>,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        Self::require_current_schema(&env)?;
        if implementation == BytesN::from_array(&env, &[0u8; 32]) {
            return Err(UpgradeError::InvalidImplementation);
        }
        env.storage()
            .persistent()
            .set(&AuthorizedImplKey::Key, &implementation);
        Ok(())
    }

    /// Propose a new upgrade version pointing at an authorized implementation hash.
    ///
    /// A version identifier may be proposed only once. If `version` is already
    /// recorded (in any state) the call returns [`UpgradeError::DuplicateVersion`]
    /// and no state is mutated. The check is a single keyed lookup, so it costs
    /// the same regardless of how many versions exist.
    ///
    /// The proposal is valid for [`PROPOSAL_EXPIRY_SECS`] ledger seconds from
    /// this call. Once that window elapses (`ledger.timestamp() >=
    /// expires_at`) the proposal can no longer be approved or executed; it can
    /// only be cancelled or queried.
    ///
    /// `state_schema` records the persistent state schema the version can
    /// read and write. It is stored with the record and checked on rollback.
    pub fn propose_upgrade(
        env: Env,
        governance: Address,
        version: u32,
        implementation: BytesN<32>,
        state_schema: u32,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        Self::require_current_schema(&env)?;

        let mut versions: Vec<u32> = env
            .storage()
            .instance()
            .get(&VersionListKey::Key)
            .unwrap_or_else(|| Vec::new(&env));
        if versions.len() >= MAX_RECORDED_VERSIONS {
            return Err(UpgradeError::VersionHistoryFull);
        }

        let key = VersionedRecordKey { version };
        if env.storage().persistent().has(&key)
            || env.storage().persistent().has(&VersionKey { version })
        {
            return Err(UpgradeError::DuplicateVersion);
        }
        Self::require_authorized_impl(&env, &implementation)?;

        let expires_at = env.ledger().timestamp() + PROPOSAL_EXPIRY_SECS;
        let current_version = Self::current_version_value(env.clone());
        let current_revision = Self::current_version_revision(env.clone());
        let stored = VersionedUpgradeRecord {
            schema_version: STORAGE_SCHEMA_VERSION,
            expected_current_version: current_version,
            expected_current_revision: current_revision,
            record: UpgradeRecord {
                version,
                implementation,
                state: UpgradeState::Proposed,
                proposed_by: governance.clone(),
                approved_by: None,
                executed_by: None,
                cancelled_by: None,
                expires_at,
            },
        };
        };
        env.storage().persistent().set(&key, &stored);

        versions.push_back(version);
        env.storage().instance().set(&VersionListKey::Key, &versions);
        Ok(())
    }

    /// Approve a proposed version. Only authorized governance may approve.
    ///
    /// The proposal must still be within its validity window; approving after
    /// expiry is rejected with [`UpgradeError::ProposalExpired`] and no state
    /// is mutated.
    pub fn approve_upgrade(
        env: Env,
        governance: Address,
        version: u32,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        Self::require_current_schema(&env)?;
        let key = VersionedRecordKey { version };
        let mut stored = Self::read_current_record(&env, version)?;
        let record = &mut stored.record;

        if record.state != UpgradeState::Proposed {
            return Err(UpgradeError::InvalidState);
        }
        Self::require_not_expired(&env, record.expires_at)?;
        Self::require_authorized_impl(&env, &record.implementation)?;

        record.state = UpgradeState::Approved;
        record.approved_by = Some(governance);
        env.storage().persistent().set(&key, &stored);
        Ok(())
    }

    /// Revoke the single governance approval before execution.
    ///
    /// The approval threshold in this manager is one governance approval.
    /// Revocation clears the approver and returns the record to Proposed in a
    /// single storage write, so the approval decision cannot be partially
    /// updated.
    pub fn revoke_approval(
        env: Env,
        governance: Address,
        version: u32,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        Self::require_current_schema(&env)?;
        let mut stored = Self::read_current_record(&env, version)?;
        if stored.record.state != UpgradeState::Approved {
            return Err(UpgradeError::InvalidState);
        }

        stored.record.state = UpgradeState::Proposed;
        stored.record.approved_by = None;
        env.storage()
            .persistent()
            .set(&VersionedRecordKey { version }, &stored);
        emit_approval_revoked(&env, version, &governance);
        Ok(())
    }

    /// Execute an approved version, making it the current version.
    ///
    /// Execution must occur within the proposal's validity window. An approved
    /// proposal whose window has elapsed cannot be executed and returns
    /// [`UpgradeError::ProposalExpired`] without mutating state; a new
    /// proposal must be created instead.
    ///
    /// A version executes at most once: re-executing an already executed
    /// version returns [`UpgradeError::InvalidState`] and mutates nothing.
    pub fn execute_upgrade(
        env: Env,
        governance: Address,
        version: u32,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        Self::require_current_schema(&env)?;
        let mut stored = Self::read_current_record(&env, version)?;
        let record = &mut stored.record;

        if record.state != UpgradeState::Approved {
            return Err(UpgradeError::InvalidState);
        }
        Self::require_not_expired(&env, record.expires_at)?;
        Self::require_authorized_impl(&env, &record.implementation)?;
        let current_version = Self::current_version_value(env.clone());
        let current_revision = Self::current_version_revision(env.clone());
        if current_version != stored.expected_current_version
            || current_revision != stored.expected_current_revision
        {
            return Err(UpgradeError::ExecutionConflict);
        }
        let next_revision = current_revision
            .checked_add(1)
            .ok_or(UpgradeError::ExecutionRevisionOverflow)?;

        record.state = UpgradeState::Executed;
        record.executed_by = Some(governance);
        env.storage()
            .persistent()
            .set(&VersionedRecordKey { version }, &stored);
        env.storage().instance().set(&CurrentVersionKey::Key, &version);
        env.storage()
            .instance()
            .set(&CurrentVersionRevisionKey::Key, &next_revision);
        // Track the newest persistent state schema written so far. It only
        // ever moves forward, so rollback can compare against it in O(1).
        let state_schema = Self::read_state_schema(&env).max(record.state_schema);
        env.storage().instance().set(&StateSchemaKey, &state_schema);
        emit_execution(&env, current_version, version);
        Ok(())
    }

    /// Migrate at most `limit` legacy records to the current storage schema.
    ///
    /// The operation is resumable: each successful batch advances a cursor,
    /// and mutating upgrade calls remain disabled until all listed records
    /// have migrated. Each batch is checked in full before any record is
    /// written, and Soroban transaction rollback protects failed invocations.
    pub fn migrate_storage(
        env: Env,
        governance: Address,
        limit: u32,
    ) -> Result<u32, UpgradeError> {
        Self::require_governance(&env, &governance)?;
        if limit == 0 || limit > MAX_MIGRATION_BATCH_SIZE {
            return Err(UpgradeError::InvalidMigrationLimit);
        }

        let schema = Self::storage_schema_version(env.clone());
        if schema == STORAGE_SCHEMA_VERSION {
            return Ok(0);
        }
        if schema != 1 {
            return Err(UpgradeError::UnsupportedStorageSchema);
        }

        let versions: Vec<u32> = env
            .storage()
            .instance()
            .get(&VersionListKey::Key)
            .unwrap_or_else(|| Vec::new(&env));
        if versions.len() > MAX_RECORDED_VERSIONS {
            return Err(UpgradeError::VersionHistoryFull);
        }
        let cursor: u32 = env
            .storage()
            .instance()
            .get(&MigrationCursorKey::Key)
            .unwrap_or(0);
        if cursor > versions.len() {
            return Err(UpgradeError::UnsupportedStorageSchema);
        }
        let end = cursor.saturating_add(limit).min(versions.len());
        let current_version = Self::current_version_value(env.clone());

        // Validate every entry first so domain errors never leave a partial batch.
        for index in cursor..end {
            let version = versions
                .get(index)
                .ok_or(UpgradeError::MigrationRecordMissing)?;
            let versioned_key = VersionedRecordKey { version };
            if env.storage().persistent().has(&versioned_key) {
                let stored: VersionedUpgradeRecord = env
                    .storage()
                    .persistent()
                    .get(&versioned_key)
                    .ok_or(UpgradeError::MigrationRecordMissing)?;
                if stored.schema_version != STORAGE_SCHEMA_VERSION {
                    return Err(UpgradeError::UnsupportedStorageSchema);
                }
            } else if !env
                .storage()
                .persistent()
                .has(&VersionKey { version })
            {
                return Err(UpgradeError::MigrationRecordMissing);
            }
        }

        for index in cursor..end {
            let version = versions
                .get(index)
                .ok_or(UpgradeError::MigrationRecordMissing)?;
            let versioned_key = VersionedRecordKey { version };
            if env.storage().persistent().has(&versioned_key) {
                continue;
            }
            let mut legacy: UpgradeRecord = env
                .storage()
                .persistent()
                .get(&VersionKey { version })
                .ok_or(UpgradeError::MigrationRecordMissing)?;
            if legacy.state == UpgradeState::Approved {
                legacy.state = UpgradeState::Proposed;
                legacy.approved_by = None;
            }
            let stored = VersionedUpgradeRecord {
                schema_version: STORAGE_SCHEMA_VERSION,
                expected_current_version: current_version,
                expected_current_revision: Self::current_version_revision(env.clone()),
                record: legacy,
            };
            env.storage().persistent().set(&versioned_key, &stored);
            env.storage()
                .persistent()
                .remove(&VersionKey { version });
        }

        env.storage().instance().set(&MigrationCursorKey::Key, &end);
        let processed = end - cursor;
        if end == versions.len() {
            env.storage()
                .instance()
                .set(&StorageSchemaVersionKey::Key, &STORAGE_SCHEMA_VERSION);
            env.storage().instance().remove(&MigrationCursorKey::Key);
            emit_migration_completed(&env, STORAGE_SCHEMA_VERSION, versions.len());
        }
        Ok(processed)
    }

    /// Cancel a proposed or approved version. Executed versions cannot be cancelled.
    pub fn cancel_upgrade(
        env: Env,
        governance: Address,
        version: u32,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        Self::require_current_schema(&env)?;
        let mut stored = Self::read_current_record(&env, version)?;
        let record = &mut stored.record;

        match record.state {
            UpgradeState::Proposed | UpgradeState::Approved => {}
            _ => return Err(UpgradeError::InvalidState),
        }

        record.state = UpgradeState::Cancelled;
        record.cancelled_by = Some(governance);
        env.storage()
            .persistent()
            .set(&VersionedRecordKey { version }, &stored);
        Ok(())
    }

    /// Roll back to a previously approved or executed version.
    ///
    /// Rollback rules: the target must exist, must have been approved or
    /// executed, must not be cancelled, and the caller must be authorized
    /// governance. The current version is set back to the target.
    ///
    /// An approved-but-not-executed target must still be within its validity
    /// window; rolling back to an expired, never-executed proposal would
    /// otherwise "execute" it through an alternative path and is rejected with
    /// [`UpgradeError::ProposalExpired`]. Previously executed versions are
    /// unaffected by expiry.
    ///
    /// The target's `state_schema` must be at least the persistent state
    /// schema already written by executed versions ([`Self::state_schema`]).
    /// A target built against an older schema cannot safely read the current
    /// state and is rejected with [`UpgradeError::IncompatibleRollbackTarget`].
    ///
    /// A bounded `reason` string is required to document why the rollback is
    /// occurring. The reason must not exceed [`MAX_ROLLBACK_REASON_LEN`] bytes.
    /// On success, a versioned rollback event is emitted with the source
    /// version, target version, and reason.
    pub fn rollback_upgrade(
        env: Env,
        governance: Address,
        target_version: u32,
        reason: String,
    ) -> Result<(), UpgradeError> {
        Self::require_governance(&env, &governance)?;
        Self::require_current_schema(&env)?;

        if reason.len() > MAX_ROLLBACK_REASON_LEN {
            return Err(UpgradeError::RollbackReasonTooLong);
        }

        let current: u32 = env
            .storage()
            .instance()
            .get(&CurrentVersionKey::Key)
            .unwrap_or(0);
        if target_version == current {
            return Err(UpgradeError::InvalidRollbackTarget);
        }
        let current_revision = Self::current_version_revision(env.clone());
        let next_revision = current_revision
            .checked_add(1)
            .ok_or(UpgradeError::ExecutionRevisionOverflow)?;

        let stored = Self::read_current_record(&env, target_version)
            .map_err(|error| match error {
                UpgradeError::UnknownVersion => UpgradeError::NoRollbackTarget,
                other => other,
            })?;
        let record = stored.record;

        match record.state {
            UpgradeState::Approved | UpgradeState::Executed => {}
            _ => return Err(UpgradeError::InvalidRollbackTarget),
        }
        // An approved-only (never executed) target must still be within its
        // validity window, otherwise rollback would effectively execute an
        // expired proposal through an alternative path. Executed targets are
        // unaffected by expiry.
        if record.state == UpgradeState::Approved {
            Self::require_not_expired(&env, record.expires_at)?;
        }
        if record.state_schema < Self::read_state_schema(&env) {
            return Err(UpgradeError::IncompatibleRollbackTarget);
        }
        Self::require_authorized_impl(&env, &record.implementation)?;

        env.storage()
            .instance()
            .set(&CurrentVersionKey::Key, &target_version);
        env.storage()
            .instance()
            .set(&CurrentVersionRevisionKey::Key, &next_revision);

        emit_rollback(&env, current, target_version, &reason);
        Ok(())
    }

    /// Read a recorded version.
    pub fn get_version(env: Env, version: u32) -> Result<UpgradeRecord, UpgradeError> {
        Ok(Self::read_record(&env, version)?.record)
    }

    /// Current active version.
    pub fn current_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&CurrentVersionKey::Key)
            .unwrap_or(0)
    }

    /// Highest persistent state schema written by any executed version.
    ///
    /// Rollback targets must record a `state_schema` at or above this value.
    pub fn state_schema(env: Env) -> u32 {
        Self::read_state_schema(&env)
    }

    /// All recorded versions in proposal order.
    pub fn versions(env: Env) -> Vec<u32> {
        env.storage()
            .instance()
            .get(&VersionListKey::Key)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// The fixed validity window (in ledger seconds) granted to every proposal.
    ///
    /// A proposal expires at `proposal timestamp + PROPOSAL_EXPIRY_SECS` and
    /// can no longer be approved or executed once `ledger.timestamp() >=
    /// expires_at`.
    pub fn proposal_expiry_secs(_env: Env) -> u64 {
        PROPOSAL_EXPIRY_SECS
    }

    /// Current record schema, treating an absent marker as legacy schema 1.
    pub fn storage_schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&StorageSchemaVersionKey::Key)
            .unwrap_or(1)
    }

    fn require_current_schema(env: &Env) -> Result<(), UpgradeError> {
        match Self::storage_schema_version(env.clone()) {
            STORAGE_SCHEMA_VERSION => Ok(()),
            1 => Err(UpgradeError::StorageMigrationRequired),
            _ => Err(UpgradeError::UnsupportedStorageSchema),
        }
    }

    fn read_record(env: &Env, version: u32) -> Result<VersionedUpgradeRecord, UpgradeError> {
        if let Some(stored) = env
            .storage()
            .persistent()
            .get::<_, VersionedUpgradeRecord>(&VersionedRecordKey { version })
        {
            if stored.schema_version != STORAGE_SCHEMA_VERSION {
                return Err(UpgradeError::UnsupportedStorageSchema);
            }
            return Ok(stored);
        }

        let record: UpgradeRecord = env
            .storage()
            .persistent()
            .get(&VersionKey { version })
            .ok_or(UpgradeError::UnknownVersion)?;
        Ok(VersionedUpgradeRecord {
            schema_version: 1,
            expected_current_version: Self::current_version_value(env.clone()),
            expected_current_revision: Self::current_version_revision(env.clone()),
            record,
        })
    }

    fn read_current_record(
        env: &Env,
        version: u32,
    ) -> Result<VersionedUpgradeRecord, UpgradeError> {
        let stored = Self::read_record(env, version)?;
        if stored.schema_version != STORAGE_SCHEMA_VERSION {
            return Err(UpgradeError::StorageMigrationRequired);
        }
        Ok(stored)
    }

    fn current_version_value(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&CurrentVersionKey::Key)
            .unwrap_or(0)
    }

    fn current_version_revision(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&CurrentVersionRevisionKey::Key)
            .unwrap_or(0)
    }

    fn require_governance(env: &Env, caller: &Address) -> Result<(), UpgradeError> {
        let governance: Address = env
            .storage()
            .instance()
            .get(&GovernanceKey::Key)
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
            .get(&AuthorizedImplKey::Key)
            .ok_or(UpgradeError::UnauthorizedImplementation)?;
        if &authorized != implementation {
            return Err(UpgradeError::UnauthorizedImplementation);
        }
        Ok(())
    }

    fn read_state_schema(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&StateSchemaKey)
            .unwrap_or(0)
    }

    fn require_not_expired(env: &Env, expires_at: u64) -> Result<(), UpgradeError> {
        if env.ledger().timestamp() >= expires_at {
            return Err(UpgradeError::ProposalExpired);
        }
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        Env,
    };

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

    fn reason_bugfix(env: &Env) -> String {
        String::from_str(env, "bugfix: incorrect fee calculation")
    }

    #[test]
    fn full_lifecycle_records_states() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
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
        client.propose_upgrade(&gov, &1, &hash, &1);
        client.cancel_upgrade(&gov, &1);
        assert_eq!(client.get_version(&1).state, UpgradeState::Cancelled);
    }

    #[test]
    fn replay_is_rejected() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);
        // Replaying execute on an already executed version must fail.
        assert_eq!(
            client.try_execute_upgrade(&gov, &1),
            Err(Ok(UpgradeError::InvalidState))
        );
        // Re-proposing the same version must fail.
        assert_eq!(
            client.try_propose_upgrade(&gov, &1, &hash, &1),
            Err(Ok(UpgradeError::DuplicateVersion))
        );
    }

    #[test]
    fn unauthorized_execution_is_rejected() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);
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
            client.try_propose_upgrade(&gov, &2, &rogue, &1),
            Err(Ok(UpgradeError::UnauthorizedImplementation))
        );
    }

    #[test]
    fn rollback_to_previous_executed_version() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        let rsn = reason_bugfix(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        client.propose_upgrade(&gov, &2, &hash, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &2);
        assert_eq!(client.current_version(), 2);

        client.rollback_upgrade(&gov, &1, &rsn);
        assert_eq!(client.current_version(), 1);
    }

    #[test]
    fn rollback_to_cancelled_version_is_rejected() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        let rsn = reason_bugfix(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);
        client.cancel_upgrade(&gov, &1);
        assert_eq!(
            client.try_rollback_upgrade(&gov, &1, &rsn),
            Err(Ok(UpgradeError::InvalidRollbackTarget))
        );
    }

    #[test]
    fn rollback_requires_governance_authorization() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        let rsn = reason_bugfix(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        let attacker = Address::generate(&env);
        assert_eq!(
            client.try_rollback_upgrade(&attacker, &1, &rsn),
            Err(Ok(UpgradeError::Unauthorized))
        );
    }

    #[test]
    fn rollback_rejects_same_version() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        let rsn = reason_bugfix(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        assert_eq!(
            client.try_rollback_upgrade(&gov, &1, &rsn),
            Err(Ok(UpgradeError::InvalidRollbackTarget))
        );
    }

    #[test]
    fn rollback_rejects_reason_too_long() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        // A reason one byte over the limit must be rejected.
        let long_reason = String::from_str(&env, &"x".repeat(MAX_ROLLBACK_REASON_LEN as usize + 1));
        assert_eq!(
            client.try_rollback_upgrade(&gov, &1, &long_reason),
            Err(Ok(UpgradeError::RollbackReasonTooLong))
        );
    }

    #[test]
    fn rollback_accepts_reason_at_max_len() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        client.propose_upgrade(&gov, &2, &hash, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &2);
        assert_eq!(client.current_version(), 2);

        // A reason exactly at the maximum length must be accepted.
        let long_reason = String::from_str(&env, &"x".repeat(MAX_ROLLBACK_REASON_LEN as usize));
        client.rollback_upgrade(&gov, &1, &long_reason);
        assert_eq!(client.current_version(), 1);
    }

    #[test]
    fn rollback_emits_versioned_event() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        let rsn = reason_bugfix(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        client.propose_upgrade(&gov, &2, &hash, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &2);
        assert_eq!(client.current_version(), 2);

        // The rollback call emits a versioned event without panicking.
        client.rollback_upgrade(&gov, &1, &rsn);
        assert_eq!(client.current_version(), 1);

        // Verify at least one event was emitted (the rollback event).
        let events = env.events().all();
        assert!(events.len() > 0);
    }

    #[test]
    fn rollback_to_approved_version_succeeds() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        let rsn = reason_bugfix(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);

        client.propose_upgrade(&gov, &2, &hash, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &2);
        assert_eq!(client.current_version(), 2);

        // Rollback to version 1 which is Approved (not executed) should work.
        client.rollback_upgrade(&gov, &1, &rsn);
        assert_eq!(client.current_version(), 1);
    }

    #[test]
    fn rollback_to_pending_version_is_rejected() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        let rsn = reason_bugfix(&env);

        // Version 1 is proposed, never approved.
        client.propose_upgrade(&gov, &1, &hash, &1);

        // Version 2 is executed.
        client.propose_upgrade(&gov, &2, &hash, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &2);
        assert_eq!(client.current_version(), 2);

        // Rollback to the proposed-only version must be rejected.
        assert_eq!(
            client.try_rollback_upgrade(&gov, &1, &rsn),
            Err(Ok(UpgradeError::InvalidRollbackTarget))
        );
    }

    #[test]
    fn rollback_empty_reason_is_accepted() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        client.propose_upgrade(&gov, &2, &hash, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &2);
        assert_eq!(client.current_version(), 2);

        // An empty reason is within the bound (0 < 256) and should succeed.
        let empty = String::from_str(&env, "");
        client.rollback_upgrade(&gov, &1, &empty);
        assert_eq!(client.current_version(), 1);
    }

    #[test]
    fn authorize_empty_implementation_is_rejected() {
        let env = Env::default();
        let (client, gov, _) = setup(&env);
        let empty = BytesN::from_array(&env, &[0u8; 32]);
        assert_eq!(
            client.try_authorize_implementation(&gov, &empty),
            Err(Ok(UpgradeError::InvalidImplementation))
        );
    }

    #[test]
    fn authorize_non_empty_implementation_succeeds() {
        let env = Env::default();
        let (client, gov, _) = setup(&env);
        let new_hash = BytesN::from_array(&env, &[42u8; 32]);
        client.authorize_implementation(&gov, &new_hash);
        // No panic means the call succeeded.
    }

    #[test]
    fn authorize_single_non_zero_byte_succeeds() {
        let env = Env::default();
        let (client, gov, _) = setup(&env);
        // A hash with only the last byte set to 1 (boundary between empty and non-empty).
        let mut arr: [u8; 32] = [0u8; 32];
        arr[31] = 1u8;
        let boundary = BytesN::from_array(&env, &arr);
        client.authorize_implementation(&gov, &boundary);
        // No panic means the call succeeded.
    }

    #[test]
    fn authorize_empty_implementation_requires_governance() {
        let env = Env::default();
        let (client, gov, _hash) = setup(&env);
        let attacker = Address::generate(&env);
        let empty = BytesN::from_array(&env, &[0u8; 32]);
        assert_eq!(
            client.try_authorize_implementation(&attacker, &empty),
            Err(Ok(UpgradeError::Unauthorized))
        );
    }

    // ------------------------------------------------------------------
    // Proposal expiry
    // ------------------------------------------------------------------

    const BASE_TS: u64 = 1_000_000;

    #[test]
    fn proposal_expiry_window_is_bounded_and_recorded() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);

        let window = client.proposal_expiry_secs();
        // The window is fixed, positive, and bounded.
        assert!(window > 0);

        client.propose_upgrade(&gov, &1, &hash, &1);
        let record = client.get_version(&1);
        assert_eq!(record.expires_at, BASE_TS + window);
        assert_eq!(record.state, UpgradeState::Proposed);
    }

    #[test]
    fn approval_within_window_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);

        // One second before the boundary the proposal is still approvable.
        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() - 1);
        client.approve_upgrade(&gov, &1);
        assert_eq!(client.get_version(&1).state, UpgradeState::Approved);
    }

    #[test]
    fn approval_at_expiry_boundary_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);

        // Exactly at expires_at the proposal is already expired.
        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs());
        assert_eq!(
            client.try_approve_upgrade(&gov, &1),
            Err(Ok(UpgradeError::ProposalExpired))
        );
        // No approval was recorded.
        assert_eq!(client.get_version(&1).state, UpgradeState::Proposed);
    }

    #[test]
    fn approval_after_expiry_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);

        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() + 1);
        assert_eq!(
            client.try_approve_upgrade(&gov, &1),
            Err(Ok(UpgradeError::ProposalExpired))
        );
    }

    #[test]
    fn execution_within_window_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);

        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() - 1);
        client.execute_upgrade(&gov, &1);
        assert_eq!(client.get_version(&1).state, UpgradeState::Executed);
        assert_eq!(client.current_version(), 1);
    }

    #[test]
    fn execution_at_expiry_boundary_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        assert_eq!(client.get_version(&1).state, UpgradeState::Approved);

        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs());
        assert_eq!(
            client.try_execute_upgrade(&gov, &1),
            Err(Ok(UpgradeError::ProposalExpired))
        );
        // The previously collected approval does not make execution possible.
        assert_eq!(client.get_version(&1).state, UpgradeState::Approved);
        assert_eq!(client.current_version(), 0);
    }

    #[test]
    fn execution_after_expiry_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);

        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() + 1);
        assert_eq!(
            client.try_execute_upgrade(&gov, &1),
            Err(Ok(UpgradeError::ProposalExpired))
        );
    }

    #[test]
    fn expire_does_not_retroactively_affect_executed_versions() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);
        assert_eq!(client.current_version(), 1);

        // Long after the window elapses the executed version stays current.
        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() + 1);
        assert_eq!(client.current_version(), 1);
        assert_eq!(client.get_version(&1).state, UpgradeState::Executed);
    }

    #[test]
    fn expired_proposal_can_still_be_cancelled() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);

        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() + 5);
        client.cancel_upgrade(&gov, &1);
        assert_eq!(client.get_version(&1).state, UpgradeState::Cancelled);
    }

    #[test]
    fn expired_proposal_is_still_queryable() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);

        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() + 1);
        let record = client.get_version(&1);
        assert_eq!(record.version, 1);
        assert_eq!(record.state, UpgradeState::Proposed);
        assert!(env.ledger().timestamp() >= record.expires_at);
    }

    #[test]
    fn expired_proposal_still_enforces_authorization() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash, &1);

        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() + 1);
        let attacker = Address::generate(&env);
        // Authorization is checked before expiry, so an unauthorized caller
        // gets `Unauthorized`, never `ProposalExpired`.
        assert_eq!(
            client.try_approve_upgrade(&attacker, &1),
            Err(Ok(UpgradeError::Unauthorized))
        );
        assert_eq!(
            client.try_execute_upgrade(&attacker, &1),
            Err(Ok(UpgradeError::Unauthorized))
        );
    }

    #[test]
    fn rollback_to_expired_approved_target_is_rejected() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        let rsn = reason_bugfix(&env);

        // Version 1 is approved but never executed.
        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);

        // Version 2 is approved and executed, becoming current.
        client.propose_upgrade(&gov, &2, &hash, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &2);
        assert_eq!(client.current_version(), 2);

        // After version 1's window elapses it can no longer be used as a
        // rollback target, since that would execute an expired proposal
        // through an alternative path.
        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() + 1);
        assert_eq!(
            client.try_rollback_upgrade(&gov, &1, &rsn),
            Err(Ok(UpgradeError::ProposalExpired))
        );
    }

    #[test]
    fn rollback_to_expired_executed_version_succeeds() {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().set_timestamp(BASE_TS);
        let (client, gov, hash) = setup(&env);
        let rsn = reason_bugfix(&env);

        client.propose_upgrade(&gov, &1, &hash);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);
        client.propose_upgrade(&gov, &2, &hash);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &2);

        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() + 1);
        client.rollback_upgrade(&gov, &1, &rsn);
        assert_eq!(client.current_version(), 1);
    }

    #[test]
    fn unknown_version_rejected() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        assert_eq!(client.try_approve_upgrade(&gov, &999), Err(Ok(UpgradeError::UnknownVersion)));
        assert_eq!(client.try_execute_upgrade(&gov, &999), Err(Ok(UpgradeError::UnknownVersion)));
        assert_eq!(client.try_cancel_upgrade(&gov, &999), Err(Ok(UpgradeError::UnknownVersion)));
        assert_eq!(client.try_get_version(&999), Err(Ok(UpgradeError::UnknownVersion)));
        assert_eq!(client.try_rollback_upgrade(&gov, &999), Err(Ok(UpgradeError::NoRollbackTarget)));
    }

    #[test]
    fn invalid_state_transitions_rejected() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        // Cannot approve non-proposed version
        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        // Cannot approve again
        assert_eq!(client.try_approve_upgrade(&gov, &1), Err(Ok(UpgradeError::InvalidState)));

        // Cannot cancel executed version
        assert_eq!(client.try_cancel_upgrade(&gov, &1), Err(Ok(UpgradeError::InvalidState)));

        // Cannot propose same version
        assert_eq!(client.try_propose_upgrade(&gov, &1, &hash, &1), Err(Ok(UpgradeError::DuplicateVersion)));
    }

    #[test]
    fn cancel_rejects_invalid_states() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        client.propose_upgrade(&gov, &2, &hash, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &2);
        assert_eq!(client.current_version(), 2);

        // Executed versions are unaffected by expiry, so rollback still works
        // long after the proposal window would have elapsed.
        env.ledger().set_timestamp(BASE_TS + client.proposal_expiry_secs() + 1);

        assert_eq!(
            client.try_cancel_upgrade(&gov, &1),
            Err(Ok(UpgradeError::InvalidState))
        );
    }

    #[test]
    fn cancel_proposed_and_approved_versions() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        // Cannot cancel executed
        assert_eq!(client.try_cancel_upgrade(&gov, &1), Err(Ok(UpgradeError::InvalidState)));

        // Cancel proposed works
        client.propose_upgrade(&gov, &2, &hash, &1);
        client.cancel_upgrade(&gov, &2);
        assert_eq!(client.get_version(&2).state, UpgradeState::Cancelled);

        // Cannot cancel again
        assert_eq!(client.try_cancel_upgrade(&gov, &2), Err(Ok(UpgradeError::InvalidState)));

        // Cancel approved works
        client.propose_upgrade(&gov, &3, &hash, &1);
        client.approve_upgrade(&gov, &3);
        client.cancel_upgrade(&gov, &3);
        assert_eq!(client.get_version(&3).state, UpgradeState::Cancelled);
    }

    #[test]
    fn rollback_rejects_no_target() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        // No version proposed
        assert_eq!(client.try_rollback_upgrade(&gov, &1), Err(Ok(UpgradeError::NoRollbackTarget)));

        // Proposed but not approved/executed
        client.propose_upgrade(&gov, &1, &hash, &1);
        assert_eq!(client.try_rollback_upgrade(&gov, &1), Err(Ok(UpgradeError::InvalidRollbackTarget)));
    }

    #[test]
    fn rollback_rejects_invalid_targets() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        // Cannot rollback to same version
        assert_eq!(client.try_rollback_upgrade(&gov, &1), Err(Ok(UpgradeError::InvalidRollbackTarget)));

        // Cannot rollback to cancelled
        client.propose_upgrade(&gov, &2, &hash, &1);
        client.cancel_upgrade(&gov, &2);
        assert_eq!(client.try_rollback_upgrade(&gov, &2), Err(Ok(UpgradeError::InvalidRollbackTarget)));

        // Cannot rollback to proposed only
        client.propose_upgrade(&gov, &3, &hash, &1);
        assert_eq!(client.try_rollback_upgrade(&gov, &3), Err(Ok(UpgradeError::InvalidRollbackTarget)));
    }

    #[test]
    fn rollback_requires_authorized_implementation() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        client.propose_upgrade(&gov, &1, &hash, &1);
        client.approve_upgrade(&gov, &1);
        client.execute_upgrade(&gov, &1);

        // Change authorized implementation
        let new_hash = BytesN::from_array(&env, &[8u8; 32]);
        client.authorize_implementation(&gov, &new_hash);

        // Rollback should fail because v1's implementation is no longer authorized
        assert_eq!(client.try_rollback_upgrade(&gov, &1), Err(Ok(UpgradeError::UnauthorizedImplementation)));
    }

    #[test]
    fn authorize_implementation_idempotent() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        // Re-authorizing same hash should succeed
        client.authorize_implementation(&gov, &hash);
    }

    #[test]
    fn version_boundary_values() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);

        // Version 0 is valid
        client.propose_upgrade(&gov, &0, &hash, &1);
        assert_eq!(client.get_version(&0).version, 0);

        // Max u32 version
        client.propose_upgrade(&gov, &u32::MAX, &hash, &1);
        assert_eq!(client.get_version(&u32::MAX).version, u32::MAX);
    }

    #[test]
    fn all_upgrade_error_variants_have_stable_codes() {
        assert_eq!(UpgradeError::NotInitialized as u32, 1);
        assert_eq!(UpgradeError::AlreadyInitialized as u32, 2);
        assert_eq!(UpgradeError::Unauthorized as u32, 3);
        assert_eq!(UpgradeError::UnknownVersion as u32, 4);
        assert_eq!(UpgradeError::InvalidState as u32, 5);
        assert_eq!(UpgradeError::UnauthorizedImplementation as u32, 6);
        assert_eq!(UpgradeError::DuplicateVersion as u32, 7);
        assert_eq!(UpgradeError::NoRollbackTarget as u32, 8);
        assert_eq!(UpgradeError::InvalidRollbackTarget as u32, 9);
        assert_eq!(UpgradeError::RollbackReasonTooLong as u32, 10);
        assert_eq!(UpgradeError::InvalidImplementation as u32, 11);
        assert_eq!(UpgradeError::ProposalExpired as u32, 12);
        assert_eq!(UpgradeError::ExecutionConflict as u32, 13);
        assert_eq!(UpgradeError::StorageMigrationRequired as u32, 14);
        assert_eq!(UpgradeError::InvalidMigrationLimit as u32, 15);
        assert_eq!(UpgradeError::UnsupportedStorageSchema as u32, 16);
        assert_eq!(UpgradeError::MigrationRecordMissing as u32, 17);
        assert_eq!(UpgradeError::ExecutionRevisionOverflow as u32, 18);
        assert_eq!(UpgradeError::VersionHistoryFull as u32, 19);
    }

    #[test]
    fn all_upgrade_error_variants_are_unique() {
        let codes = vec![
            UpgradeError::NotInitialized as u32,
            UpgradeError::AlreadyInitialized as u32,
            UpgradeError::Unauthorized as u32,
            UpgradeError::UnknownVersion as u32,
            UpgradeError::InvalidState as u32,
            UpgradeError::UnauthorizedImplementation as u32,
            UpgradeError::DuplicateVersion as u32,
            UpgradeError::NoRollbackTarget as u32,
            UpgradeError::InvalidRollbackTarget as u32,
            UpgradeError::RollbackReasonTooLong as u32,
            UpgradeError::InvalidImplementation as u32,
            UpgradeError::ProposalExpired as u32,
            UpgradeError::ExecutionConflict as u32,
            UpgradeError::StorageMigrationRequired as u32,
            UpgradeError::InvalidMigrationLimit as u32,
            UpgradeError::UnsupportedStorageSchema as u32,
            UpgradeError::MigrationRecordMissing as u32,
            UpgradeError::ExecutionRevisionOverflow as u32,
            UpgradeError::VersionHistoryFull as u32,
        ];
        let mut sorted = codes.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), codes.len());
    }

    #[test]
    fn competing_executions_cannot_overwrite_current_version() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash);
        client.propose_upgrade(&gov, &2, &hash);

        client.approve_upgrade(&gov, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &1);

        assert_eq!(
            client.try_execute_upgrade(&gov, &2),
            Err(Ok(UpgradeError::ExecutionConflict))
        );
        assert_eq!(client.current_version(), 1);
        assert_eq!(client.get_version(&2).state, UpgradeState::Approved);
    }

    #[test]
    fn rollback_does_not_revalidate_stale_execution_proposals() {
        let env = Env::default
        client.approve_upgrade(&gov, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &1);

        assert_eq!(
            client.try_execute_upgrade(&gov, &2),
            Err(Ok(UpgradeError::ExecutionConflict))
        );
        assert_eq!(client.current_version(), 1);
        assert_eq!(client.get_version(&2).state, UpgradeState::Approved);
    }

    #[test]
    fn rollback_does_not_revalidate_stale_execution_proposals() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &0, &hash);
        client.approve_upgrade(&gov, &0);
        client.execute_upgrade(&gov, &0);

        client.propose_upgrade(&gov, &1, &hash);
        client.propose_upgrade(&gov, &2, &hash);
        client.approve_upgrade(&gov, &1);
        client.approve_upgrade(&gov, &2);
        client.execute_upgrade(&gov, &1);
        client.rollback_upgrade(&gov, &0, &String::from_str(&env, "restore"));

        assert_eq!(client.current_version(), 0);
        assert_eq!(
            client.try_execute_upgrade(&gov, &2),
            Err(Ok(UpgradeError::ExecutionConflict))
        );
        assert_eq!(client.current_version(), 0);
    }

    #[test]
    fn revoke_approval_resets_threshold_decision_atomically() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash);
        client.approve_upgrade(&gov, &1);

        client.revoke_approval(&gov, &1);
        let record = client.get_version(&1);
        assert_eq!(record.state, UpgradeState::Proposed);
        assert_eq!(record.approved_by, None);
        assert_eq!(client.current_version(), 0);
        assert_eq!(
            client.try_execute_upgrade(&gov, &1),
            Err(Ok(UpgradeError::InvalidState))
        );
    }

    #[test]
    fn revoke_approval_checks_authorization_and_state() {
        let env = Env::default();
        let (client, gov, hash) = setup(&env);
        client.propose_upgrade(&gov, &1, &hash);
        client.approve_upgrade(&gov, &1);

        let attacker = Address::generate(&env);
        assert_eq!(
            client.try_revoke_approval(&attacker, &1),
            Err(Ok(UpgradeError::Unauthorized))
        );
        client.execute_upgrade(&gov, &1);
        assert_eq!(
            client.try_revoke_approval(&gov, &1),
            Err(Ok(UpgradeError::InvalidState))
        );
    }

    #[test]
    fn migration_is_bounded_resumable_and_governance_only() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, UpgradeManager);
        let client = UpgradeManagerClient::new(&env, &contract_id);
        let gov = Address::generate(&env);
        client.initialize(&gov);
        let implementation = hash(&env, 31);
        let first = UpgradeRecord {
            version: 1,
            implementation: implementation.clone(),
            state: UpgradeState::Approved,
            proposed_by: gov.clone(),
            approved_by: Some(gov.clone()),
            executed_by: None,
            cancelled_by: None,
            expires_at: BASE_TS + PROPOSAL_EXPIRY_SECS,
        };
        let second = UpgradeRecord {
            version: 2,
            ..first.clone()
        };
        let versions = Vec::from_array(&env, &[1u32, 2u32]);
        env.as_contract(&contract_id, || {
            env.storage().instance().remove(&StorageSchemaVersionKey::Key);
            env.storage().instance().set(&VersionListKey::Key, &versions);
            env.storage()
                .persistent()
                .set(&VersionKey { version: 1 }, &first);
            env.storage()
                .persistent()
                .set(&VersionKey { version: 2 }, &second);
        });

        let attacker = Address::generate(&env);
        assert_eq!(
            client.try_migrate_storage(&attacker, &1),
            Err(Ok(UpgradeError::Unauthorized))
        );
        assert_eq!(
            client.try_migrate_storage(&gov, &0),
            Err(Ok(UpgradeError::InvalidMigrationLimit))
        );
        assert_eq!(
            client.try_migrate_storage(&gov, &(MAX_MIGRATION_BATCH_SIZE + 1)),
            Err(Ok(UpgradeError::InvalidMigrationLimit))
        );

        assert_eq!(client.migrate_storage(&gov, &1), 1);
        assert_eq!(client.storage_schema_version(), 1);
        assert_eq!(client.get_version(&1).state, UpgradeState::Proposed);
        assert_eq!(client.get_version(&1).approved_by, None);
        assert_eq!(client.migrate_storage(&gov, &1), 1);
        assert_eq!(client.storage_schema_version(), STORAGE_SCHEMA_VERSION);
        assert_eq!(client.get_version(&2).state, UpgradeState::Proposed);
    }

    #[test]
    fn migration_failure_leaves_batch_unchanged() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, UpgradeManager);
        let client = UpgradeManagerClient::new(&env, &contract_id);
        let gov = Address::generate(&env);
        client.initialize(&gov);
        let implementation = hash(&env, 32);
        let record = UpgradeRecord {
            version: 1,
            implementation,
            state: UpgradeState::Proposed,
            proposed_by: gov.clone(),
            approved_by: None,
            executed_by: None,
            cancelled_by: None,
            expires_at: BASE_TS + PROPOSAL_EXPIRY_SECS,
        };
        let versions = Vec::from_array(&env, &[1u32, 2u32]);
        env.as_contract(&contract_id, || {
            env.storage().instance().remove(&StorageSchemaVersionKey::Key);
            env.storage().instance().set(&VersionListKey::Key, &versions);
            env.storage()
                .persistent()
                .set(&VersionKey { version: 1 }, &record);
        });

        assert_eq!(
            client.try_migrate_storage(&gov, &2),
            Err(Ok(UpgradeError::MigrationRecordMissing))
        );
        env.as_contract(&contract_id, || {
            assert!(env
                .storage()
                .persistent()
                .has(&VersionKey { version: 1 }));
            assert!(!env
                .storage()
                .persistent()
                .has(&VersionedRecordKey { version: 1 }));
            assert_eq!(
                env.storage().instance().get::<_, u32>(&MigrationCursorKey::Key),
                None
            );
        });
        assert_eq!(client.storage_schema_version(), 1);
    }

    #[test]
    fn mutations_are_blocked_until_legacy_migration_finishes() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, UpgradeManager);
        let client = UpgradeManagerClient::new(&env, &contract_id);
        let gov = Address::generate(&env);
        let implementation = hash(&env, 33);
        client.initialize(&gov);
        client.authorize_implementation(&gov, &implementation);
        env.as_contract(&contract_id, || {
            env.storage().instance().remove(&StorageSchemaVersionKey::Key);
        });
        assert_eq!(
            client.try_propose_upgrade(&gov, &1, &implementation),
            Err(Ok(UpgradeError::StorageMigrationRequired))
        );
    }

    #[test]
    fn version_history_limit_is_enforced_without_mutation() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, UpgradeManager);
        let client = UpgradeManagerClient::new(&env, &contract_id);
        let gov = Address::generate(&env);
        let implementation = hash(&env, 34);
        client.initialize(&gov);
        client.authorize_implementation(&gov, &implementation);
        let mut versions = Vec::new(&env);
        for version in 0..MAX_RECORDED_VERSIONS {
            versions.push_back(version);
        }
        env.as_contract(&contract_id, || {
            env.storage().instance().set(&VersionListKey::Key, &versions);
        });

        assert_eq!(
            client.try_propose_upgrade(&gov, &MAX_RECORDED_VERSIONS, &implementation),
            Err(Ok(UpgradeError::VersionHistoryFull))
        );
        assert_eq!(client.versions().len(), MAX_RECORDED_VERSIONS);
    }
}
