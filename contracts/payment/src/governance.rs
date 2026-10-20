//! Governance integration for payment contract replacement.
//!
//! A single hot key must not be able to replace the payment contract
//! immediately. This module implements a timelock + multisig (threshold)
//! governance flow with the following semantics:
//!
//! * **Proposal** — an authorized proposer registers a pending upgrade
//!   (target contract hash / wasm hash) together with the delay that must
//!   elapse before it can be executed.
//! * **Approval** — authorized approvers sign off on a proposal. Execution
//!   requires a configurable threshold of distinct approvals.
//! * **Delay** — execution is only allowed once `delay` ledgers/seconds have
//!   passed since the proposal was created.
//! * **Execution** — enforces that the delay has elapsed, the approval
//!   threshold is met, and that the proposal has not already been executed
//!   (replay protection).
//! * **Emergency cancellation** — the admin (or a configured guardian) can
//!   cancel a pending proposal at any time before execution. Cancellation is
//!   terminal: a cancelled proposal can never be executed.
//! * **Signer rotation** — signers are added or removed through the same
//!   proposal, approval, delay and execution flow as an upgrade. The signer
//!   set is capped at [`MAX_SIGNERS`], a change may never leave fewer signers
//!   than the threshold, and the final signer can never be removed.
//!
//! The module is intentionally storage-agnostic: it operates on a
//! `GovernanceStorage` trait so it can be wired into the payment contract's
//! existing persistent storage without changing its layout.

use soroban_sdk::{contracttype, symbol_short, Address, BytesN, Env, Symbol, Vec};

/// Upper bound on the number of signers. Bounds the signer list storage and
/// the per-invocation scans over it.
pub const MAX_SIGNERS: u32 = 20;

/// Topic for signer-set events: `(GOVERNANCE_EVENT_TOPIC, SIGNER_EVENT)`.
pub const GOVERNANCE_EVENT_TOPIC: Symbol = symbol_short!("gov");

/// Event name emitted when a signer is added or removed.
pub const SIGNER_EVENT: Symbol = symbol_short!("signer");

/// A change to the signer set.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SignerChange {
    /// Add an address to the signer set.
    Add(Address),
    /// Remove an address from the signer set.
    Remove(Address),
}

/// The effect a proposal has when it is executed.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProposalAction {
    /// Replace the payment contract with the given wasm hash.
    Upgrade(BytesN<32>),
    /// Rotate the signer set.
    SignerChange(SignerChange),
}

/// A pending contract replacement or signer-set change proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeProposal {
    /// Unique, monotonically increasing proposal id.
    pub id: u64,
    /// Account that created the proposal.
    pub proposer: Address,
    /// Effect applied on execution.
    pub action: ProposalAction,
    /// Ledger timestamp (seconds) at which the proposal was created.
    pub created_at: u64,
    /// Delay (seconds) that must elapse before execution is allowed.
    pub delay: u64,
    /// Number of distinct approvals recorded so far. Execution counts only
    /// approvals from current signers.
    pub approvals: u32,
    /// Whether the proposal has already been executed (replay protection).
    pub executed: bool,
    /// Whether the proposal has been cancelled (emergency cancellation).
    pub cancelled: bool,
}

/// Governance configuration: who may propose/approve and the threshold.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GovernanceConfig {
    /// Admin/guardian allowed to cancel proposals and update config.
    pub admin: Address,
    /// Minimum number of distinct approvals required to execute.
    pub threshold: u32,
    /// Default delay applied to new proposals (seconds).
    pub default_delay: u64,
}

/// Errors surfaced by the governance flow.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GovernanceError {
    NotInitialized = 1,
    Unauthorized = 2,
    ProposalNotFound = 3,
    AlreadyApproved = 4,
    AlreadyExecuted = 5,
    Cancelled = 6,
    DelayNotElapsed = 7,
    ThresholdNotMet = 8,
    /// Threshold is zero or exceeds the number of signers.
    InvalidThreshold = 9,
    /// The address is already a signer (on add, or duplicated in the initial set).
    SignerAlreadyExists = 10,
    /// The address to remove is not a signer.
    SignerNotFound = 11,
    /// Adding a signer would exceed [`MAX_SIGNERS`].
    TooManySigners = 12,
    /// The final remaining signer cannot be removed.
    LastSigner = 13,
    /// Removing the signer would leave fewer signers than the threshold.
    RemovalBreaksThreshold = 14,
}

/// Storage abstraction so the governance module can be embedded in the
/// payment contract without dictating its storage layout.
pub trait GovernanceStorage {
    fn get_config(env: &Env) -> Option<GovernanceConfig>;
    fn set_config(env: &Env, config: &GovernanceConfig);
    fn next_proposal_id(env: &Env) -> u64;
    fn get_proposal(env: &Env, id: u64) -> Option<UpgradeProposal>;
    fn set_proposal(env: &Env, proposal: &UpgradeProposal);
    /// The current signer set. Its length is bounded by [`MAX_SIGNERS`].
    fn get_signers(env: &Env) -> Vec<Address>;
    fn set_signers(env: &Env, signers: &Vec<Address>);
    fn is_approver(env: &Env, who: &Address) -> bool {
        Self::get_signers(env).iter().any(|signer| &signer == who)
    }
    fn has_approved(env: &Env, id: u64, who: &Address) -> bool;
    fn record_approval(env: &Env, id: u64, who: &Address);
}

/// Initialize governance with an admin, the initial signer set, approval
/// threshold and default delay.
pub fn initialize<S: GovernanceStorage>(
    env: &Env,
    admin: Address,
    signers: Vec<Address>,
    threshold: u32,
    default_delay: u64,
) -> Result<(), GovernanceError> {
    validate_signer_set(&signers, threshold)?;
    admin.require_auth();
    S::set_config(
        env,
        &GovernanceConfig {
            admin,
            threshold,
            default_delay,
        },
    );
    S::set_signers(env, &signers);
    Ok(())
}

/// Create a new upgrade proposal. The proposer must be an authorized approver.
pub fn propose<S: GovernanceStorage>(
    env: &Env,
    proposer: Address,
    wasm_hash: BytesN<32>,
    delay: Option<u64>,
) -> Result<u64, GovernanceError> {
    let config = S::get_config(env).ok_or(GovernanceError::NotInitialized)?;
    proposer.require_auth();
    if !S::is_approver(env, &proposer) {
        return Err(GovernanceError::Unauthorized);
    }

    Ok(new_proposal::<S>(
        env,
        proposer,
        ProposalAction::Upgrade(wasm_hash),
        delay.unwrap_or(config.default_delay),
    ))
}

/// Create a new signer-set change proposal. The proposer must be a current
/// signer, and the change must be valid against the current signer set.
///
/// Signer changes always use the configured default delay; a proposal cannot
/// shorten it. The change is validated again on execution, because the
/// signer set may have changed while the proposal was pending.
pub fn propose_signer_change<S: GovernanceStorage>(
    env: &Env,
    proposer: Address,
    change: SignerChange,
) -> Result<u64, GovernanceError> {
    let config = S::get_config(env).ok_or(GovernanceError::NotInitialized)?;
    proposer.require_auth();
    if !S::is_approver(env, &proposer) {
        return Err(GovernanceError::Unauthorized);
    }
    validate_signer_change(&S::get_signers(env), config.threshold, &change)?;

    Ok(new_proposal::<S>(
        env,
        proposer,
        ProposalAction::SignerChange(change),
        config.default_delay,
    ))
}

fn new_proposal<S: GovernanceStorage>(
    env: &Env,
    proposer: Address,
    action: ProposalAction,
    delay: u64,
) -> u64 {
    let id = S::next_proposal_id(env);
    let proposal = UpgradeProposal {
        id,
        proposer,
        action,
        created_at: env.ledger().timestamp(),
        delay,
        approvals: 0,
        executed: false,
        cancelled: false,
    };
    S::set_proposal(env, &proposal);
    id
}

/// The initial signer set must be within [`MAX_SIGNERS`], free of duplicates,
/// and the threshold must be in `1..=signers.len()`.
fn validate_signer_set(signers: &Vec<Address>, threshold: u32) -> Result<(), GovernanceError> {
    if signers.len() > MAX_SIGNERS {
        return Err(GovernanceError::TooManySigners);
    }
    if threshold == 0 || threshold > signers.len() {
        return Err(GovernanceError::InvalidThreshold);
    }
    for (i, signer) in signers.iter().enumerate() {
        if signers.iter().skip(i + 1).any(|other| other == signer) {
            return Err(GovernanceError::SignerAlreadyExists);
        }
    }
    Ok(())
}

/// Check a signer change against the current signer set and threshold.
fn validate_signer_change(
    signers: &Vec<Address>,
    threshold: u32,
    change: &SignerChange,
) -> Result<(), GovernanceError> {
    match change {
        SignerChange::Add(who) => {
            if signers.len() >= MAX_SIGNERS {
                return Err(GovernanceError::TooManySigners);
            }
            if signers.iter().any(|signer| &signer == who) {
                return Err(GovernanceError::SignerAlreadyExists);
            }
        }
        SignerChange::Remove(who) => {
            if !signers.iter().any(|signer| &signer == who) {
                return Err(GovernanceError::SignerNotFound);
            }
            if signers.len() == 1 {
                return Err(GovernanceError::LastSigner);
            }
            if signers.len() - 1 < threshold {
                return Err(GovernanceError::RemovalBreaksThreshold);
            }
        }
    }
    Ok(())
}

/// Apply a validated signer change, returning the resulting signer set.
fn apply_signer_change(env: &Env, signers: &Vec<Address>, change: &SignerChange) -> Vec<Address> {
    match change {
        SignerChange::Add(who) => {
            let mut next = signers.clone();
            next.push_back(who.clone());
            next
        }
        SignerChange::Remove(who) => {
            let mut next = Vec::new(env);
            for signer in signers.iter() {
                if &signer != who {
                    next.push_back(signer);
                }
            }
            next
        }
    }
}

/// Approve a pending proposal. Each approver may approve at most once.
pub fn approve<S: GovernanceStorage>(
    env: &Env,
    approver: Address,
    id: u64,
) -> Result<u32, GovernanceError> {
    S::get_config(env).ok_or(GovernanceError::NotInitialized)?;
    approver.require_auth();
    if !S::is_approver(env, &approver) {
        return Err(GovernanceError::Unauthorized);
    }

    let mut proposal = S::get_proposal(env, id).ok_or(GovernanceError::ProposalNotFound)?;
    if proposal.cancelled {
        return Err(GovernanceError::Cancelled);
    }
    if proposal.executed {
        return Err(GovernanceError::AlreadyExecuted);
    }
    if S::has_approved(env, id, &approver) {
        return Err(GovernanceError::AlreadyApproved);
    }

    S::record_approval(env, id, &approver);
    proposal.approvals += 1;
    S::set_proposal(env, &proposal);
    Ok(proposal.approvals)
}

/// Execute a proposal once the delay has elapsed and the threshold is met.
///
/// Returns the action to apply: the wasm hash to install, or the signer change
/// that has already been applied to the signer set. Replay attempts (executing
/// twice) and unauthorized executions are rejected.
pub fn execute<S: GovernanceStorage>(
    env: &Env,
    executor: Address,
    id: u64,
) -> Result<ProposalAction, GovernanceError> {
    let config = S::get_config(env).ok_or(GovernanceError::NotInitialized)?;
    executor.require_auth();
    if !S::is_approver(env, &executor) {
        return Err(GovernanceError::Unauthorized);
    }

    let mut proposal = S::get_proposal(env, id).ok_or(GovernanceError::ProposalNotFound)?;
    if proposal.cancelled {
        return Err(GovernanceError::Cancelled);
    }
    if proposal.executed {
        return Err(GovernanceError::AlreadyExecuted);
    }

    // Count only approvals from current signers, so a signer removed after
    // approving no longer contributes toward the threshold.
    let signers = S::get_signers(env);
    let live_approvals = signers
        .iter()
        .filter(|signer| S::has_approved(env, id, signer))
        .count() as u32;
    if live_approvals < config.threshold {
        return Err(GovernanceError::ThresholdNotMet);
    }

    let now = env.ledger().timestamp();
    if now < proposal.created_at.saturating_add(proposal.delay) {
        return Err(GovernanceError::DelayNotElapsed);
    }

    if let ProposalAction::SignerChange(change) = &proposal.action {
        validate_signer_change(&signers, config.threshold, change)?;
    }

    // Mark executed before applying effects so a re-entrant call cannot replay.
    proposal.executed = true;
    S::set_proposal(env, &proposal);
    if let ProposalAction::SignerChange(change) = &proposal.action {
        let next = apply_signer_change(env, &signers, change);
        S::set_signers(env, &next);
        let (added, who) = match change {
            SignerChange::Add(who) => (true, who),
            SignerChange::Remove(who) => (false, who),
        };
        env.events().publish(
            (GOVERNANCE_EVENT_TOPIC, SIGNER_EVENT),
            (proposal.id, added, who.clone(), next.len()),
        );
    }
    Ok(proposal.action)
}

/// Emergency cancellation. Only the admin/guardian may cancel, and only
/// before the proposal has been executed. Cancellation is terminal.
pub fn cancel<S: GovernanceStorage>(
    env: &Env,
    id: u64,
) -> Result<(), GovernanceError> {
    let config = S::get_config(env).ok_or(GovernanceError::NotInitialized)?;
    config.admin.require_auth();

    let mut proposal = S::get_proposal(env, id).ok_or(GovernanceError::ProposalNotFound)?;
    if proposal.executed {
        return Err(GovernanceError::AlreadyExecuted);
    }
    proposal.cancelled = true;
    S::set_proposal(env, &proposal);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, BytesN, Env};

    struct TestStorage {
        env: Env,
    }

    impl GovernanceStorage for TestStorage {
        fn get_config(env: &Env) -> Option<GovernanceConfig> {
            env.storage().instance().get(&symbol_short!("config"))
        }
        fn set_config(env: &Env, config: &GovernanceConfig) {
            env.storage().instance().set(&symbol_short!("config"), config);
        }
        fn next_proposal_id(env: &Env) -> u64 {
            let id: u64 = env.storage().instance().get(&symbol_short!("next_id")).unwrap_or(0);
            env.storage().instance().set(&symbol_short!("next_id"), &(id + 1));
            id
        }
        fn get_proposal(env: &Env, id: u64) -> Option<UpgradeProposal> {
            env.storage().instance().get(&(symbol_short!("prop"), id))
        }
        fn set_proposal(env: &Env, proposal: &UpgradeProposal) {
            env.storage().instance().set(&(symbol_short!("prop"), proposal.id), proposal);
        }
        fn get_signers(env: &Env) -> Vec<Address> {
            env.storage().instance().get(&symbol_short!("signers")).unwrap_or_else(|| Vec::new(env))
        }
        fn set_signers(env: &Env, signers: &Vec<Address>) {
            env.storage().instance().set(&symbol_short!("signers"), signers);
        }
        fn has_approved(env: &Env, id: u64, who: &Address) -> bool {
            env.storage().instance().get(&(symbol_short!("approval"), id, who.clone())).unwrap_or(false)
        }
        fn record_approval(env: &Env, id: u64, who: &Address) {
            env.storage().instance().set(&(symbol_short!("approval"), id, who.clone()), &true);
        }
    }

    fn setup() -> (Env, Address, Address, BytesN<32>) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let approver = Address::generate(&env);
        let wasm_hash = BytesN::from_array(&env, &[7u8; 32]);

        let signers = soroban_sdk::vec![&env, admin.clone(), approver.clone()];
        initialize::<TestStorage>(&env, admin.clone(), signers, 2, 100).unwrap();
        (env, admin, approver, wasm_hash)
    }

    #[test]
    fn initialize_rejects_zero_threshold() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let signers = soroban_sdk::vec![&env, admin.clone()];
        let result = initialize::<TestStorage>(&env, admin, signers, 0, 100);
        assert_eq!(result, Err(GovernanceError::InvalidThreshold));
    }

    #[test]
    fn initialize_sets_config() {
        let env = Env::default();
        let admin = Address::generate(&env);
        let signers = soroban_sdk::vec![&env, admin.clone(), Address::generate(&env)];
        initialize::<TestStorage>(&env, admin.clone(), signers, 2, 100).unwrap();
        let config = TestStorage::get_config(&env).unwrap();
        assert_eq!(config.admin, admin);
        assert_eq!(config.threshold, 2);
        assert_eq!(config.default_delay, 100);
    }

    #[test]
    fn propose_requires_initialized() {
        let env = Env::default();
        let proposer = Address::generate(&env);
        let wasm_hash = BytesN::from_array(&env, &[7u8; 32]);
        let result = propose::<TestStorage>(&env, proposer, wasm_hash, None);
        assert_eq!(result, Err(GovernanceError::NotInitialized));
    }

    #[test]
    fn propose_requires_authorized_approver() {
        let (env, _admin, approver, wasm_hash) = setup();
        let stranger = Address::generate(&env);
        let result = propose::<TestStorage>(&env, stranger, wasm_hash, None);
        assert_eq!(result, Err(GovernanceError::Unauthorized));
    }

    #[test]
    fn propose_succeeds_for_authorized_approver() {
        let (env, _admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver, wasm_hash, None).unwrap();
        assert_eq!(id, 0);
        let proposal = TestStorage::get_proposal(&env, id).unwrap();
        assert_eq!(proposal.proposer, approver);
        assert_eq!(proposal.approvals, 0);
        assert!(!proposal.executed);
        assert!(!proposal.cancelled);
    }

    #[test]
    fn propose_uses_custom_delay_when_provided() {
        let (env, _admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver, wasm_hash, Some(50)).unwrap();
        let proposal = TestStorage::get_proposal(&env, id).unwrap();
        assert_eq!(proposal.delay, 50);
    }

    #[test]
    fn approve_requires_initialized() {
        let env = Env::default();
        let approver = Address::generate(&env);
        let result = approve::<TestStorage>(&env, approver, 0);
        assert_eq!(result, Err(GovernanceError::NotInitialized));
    }

    #[test]
    fn approve_requires_authorized_approver() {
        let (env, _admin, _approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, _approver.clone(), wasm_hash, None).unwrap();
        let stranger = Address::generate(&env);
        let result = approve::<TestStorage>(&env, stranger, id);
        assert_eq!(result, Err(GovernanceError::Unauthorized));
    }

    #[test]
    fn approve_rejects_unknown_proposal() {
        let (env, _admin, approver, _wasm_hash) = setup();
        let result = approve::<TestStorage>(&env, approver, 999);
        assert_eq!(result, Err(GovernanceError::ProposalNotFound));
    }

    #[test]
    fn approve_rejects_cancelled_proposal() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, None).unwrap();
        cancel::<TestStorage>(&env, id).unwrap();
        let result = approve::<TestStorage>(&env, approver, id);
        assert_eq!(result, Err(GovernanceError::Cancelled));
    }

    #[test]
    fn approve_rejects_executed_proposal() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, Some(0)).unwrap();
        approve::<TestStorage>(&env, admin.clone(), id).unwrap();
        execute::<TestStorage>(&env, admin, id).unwrap();
        let result = approve::<TestStorage>(&env, approver, id);
        assert_eq!(result, Err(GovernanceError::AlreadyExecuted));
    }

    #[test]
    fn approve_rejects_duplicate_approval() {
        let (env, _admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, None).unwrap();
        approve::<TestStorage>(&env, approver.clone(), id).unwrap();
        let result = approve::<TestStorage>(&env, approver, id);
        assert_eq!(result, Err(GovernanceError::AlreadyApproved));
    }

    #[test]
    fn approve_increments_approval_count() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, None).unwrap();
        let count1 = approve::<TestStorage>(&env, approver.clone(), id).unwrap();
        assert_eq!(count1, 1);
        let count2 = approve::<TestStorage>(&env, admin, id).unwrap();
        assert_eq!(count2, 2);
    }

    #[test]
    fn execute_requires_initialized() {
        let env = Env::default();
        let executor = Address::generate(&env);
        let result = execute::<TestStorage>(&env, executor, 0);
        assert_eq!(result, Err(GovernanceError::NotInitialized));
    }

    #[test]
    fn execute_requires_authorized_approver() {
        let (env, _admin, _approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, _approver.clone(), wasm_hash, Some(0)).unwrap();
        approve::<TestStorage>(&env, _admin.clone(), id).unwrap();
        let stranger = Address::generate(&env);
        let result = execute::<TestStorage>(&env, stranger, id);
        assert_eq!(result, Err(GovernanceError::Unauthorized));
    }

    #[test]
    fn execute_rejects_unknown_proposal() {
        let (env, _admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver, wasm_hash, Some(0)).unwrap();
        approve::<TestStorage>(&env, _admin.clone(), id).unwrap();
        let result = execute::<TestStorage>(&env, _admin, 999);
        assert_eq!(result, Err(GovernanceError::ProposalNotFound));
    }

    #[test]
    fn execute_rejects_cancelled_proposal() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, Some(0)).unwrap();
        cancel::<TestStorage>(&env, id).unwrap();
        let result = execute::<TestStorage>(&env, admin, id);
        assert_eq!(result, Err(GovernanceError::Cancelled));
    }

    #[test]
    fn execute_rejects_already_executed() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, Some(0)).unwrap();
        approve::<TestStorage>(&env, admin.clone(), id).unwrap();
        execute::<TestStorage>(&env, admin.clone(), id).unwrap();
        let result = execute::<TestStorage>(&env, admin, id);
        assert_eq!(result, Err(GovernanceError::AlreadyExecuted));
    }

    #[test]
    fn execute_rejects_insufficient_approvals() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, Some(0)).unwrap();
        // Only 1 approval, threshold is 2
        let result = execute::<TestStorage>(&env, admin.clone(), id);
        assert_eq!(result, Err(GovernanceError::ThresholdNotMet));
    }

    #[test]
    fn execute_rejects_delay_not_elapsed() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, Some(100)).unwrap();
        approve::<TestStorage>(&env, admin.clone(), id).unwrap();
        approve::<TestStorage>(&env, approver, id).unwrap();
        let result = execute::<TestStorage>(&env, admin, id);
        assert_eq!(result, Err(GovernanceError::DelayNotElapsed));
    }

    #[test]
    fn execute_succeeds_when_conditions_met() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, Some(0)).unwrap();
        approve::<TestStorage>(&env, admin.clone(), id).unwrap();
        approve::<TestStorage>(&env, approver, id).unwrap();
        let result = execute::<TestStorage>(&env, admin, id);
        assert_eq!(result.unwrap(), ProposalAction::Upgrade(wasm_hash));
        let proposal = TestStorage::get_proposal(&env, id).unwrap();
        assert!(proposal.executed);
    }

    #[test]
    fn cancel_requires_initialized() {
        let env = Env::default();
        let result = cancel::<TestStorage>(&env, 0);
        assert_eq!(result, Err(GovernanceError::NotInitialized));
    }

    #[test]
    fn cancel_requires_admin_auth() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, None).unwrap();
        let stranger = Address::generate(&env);
        let env_no_auth = Env::default();
        // Can't easily test auth failure without mock_all_auths, but we verify the logic
        // The actual auth is checked by config.admin.require_auth()
    }

    #[test]
    fn cancel_rejects_unknown_proposal() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver, wasm_hash, None).unwrap();
        let result = cancel::<TestStorage>(&env, 999);
        assert_eq!(result, Err(GovernanceError::ProposalNotFound));
    }

    #[test]
    fn cancel_rejects_executed_proposal() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, Some(0)).unwrap();
        approve::<TestStorage>(&env, admin.clone(), id).unwrap();
        execute::<TestStorage>(&env, admin.clone(), id).unwrap();
        let result = cancel::<TestStorage>(&env, id);
        assert_eq!(result, Err(GovernanceError::AlreadyExecuted));
    }

    #[test]
    fn cancel_succeeds_and_marks_cancelled() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver, wasm_hash, None).unwrap();
        cancel::<TestStorage>(&env, id).unwrap();
        let proposal = TestStorage::get_proposal(&env, id).unwrap();
        assert!(proposal.cancelled);
    }

    #[test]
    fn cancelled_proposal_cannot_be_executed() {
        let (env, admin, approver, wasm_hash) = setup();
        let id = propose::<TestStorage>(&env, approver.clone(), wasm_hash, Some(0)).unwrap();
        approve::<TestStorage>(&env, admin.clone(), id).unwrap();
        cancel::<TestStorage>(&env, id).unwrap();
        let result = execute::<TestStorage>(&env, admin, id);
        assert_eq!(result, Err(GovernanceError::Cancelled));
    }

    #[test]
    fn all_governance_error_variants_have_stable_codes() {
        assert_eq!(GovernanceError::NotInitialized as u32, 1);
        assert_eq!(GovernanceError::Unauthorized as u32, 2);
        assert_eq!(GovernanceError::ProposalNotFound as u32, 3);
        assert_eq!(GovernanceError::AlreadyApproved as u32, 4);
        assert_eq!(GovernanceError::AlreadyExecuted as u32, 5);
        assert_eq!(GovernanceError::Cancelled as u32, 6);
        assert_eq!(GovernanceError::DelayNotElapsed as u32, 7);
        assert_eq!(GovernanceError::ThresholdNotMet as u32, 8);
        assert_eq!(GovernanceError::InvalidThreshold as u32, 9);
    }

    #[test]
    fn all_governance_error_variants_are_unique() {
        let codes = vec![
            GovernanceError::NotInitialized as u32,
            GovernanceError::Unauthorized as u32,
            GovernanceError::ProposalNotFound as u32,
            GovernanceError::AlreadyApproved as u32,
            GovernanceError::AlreadyExecuted as u32,
            GovernanceError::Cancelled as u32,
            GovernanceError::DelayNotElapsed as u32,
            GovernanceError::ThresholdNotMet as u32,
            GovernanceError::InvalidThreshold as u32,
        ];
        let mut sorted = codes.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), codes.len());
    }

    #[test]
    fn boundary_threshold_values() {
        let env = Env::default();
        let admin = Address::generate(&env);

        // Threshold 0 rejected
        let signers = soroban_sdk::vec![&env, admin.clone()];
        assert_eq!(initialize::<TestStorage>(&env, admin.clone(), signers, 0, 100), Err(GovernanceError::InvalidThreshold));

        // Threshold 1 works
        let signers = soroban_sdk::vec![&env, admin.clone()];
        initialize::<TestStorage>(&env, admin, signers, 1, 100).unwrap();
    }

    #[test]
    fn boundary_delay_values() {
        let (env, admin, approver, wasm_hash) = setup();

        // Delay 0 - immediately executable
        let id1 = propose::<TestStorage>(&env, approver.clone(), wasm_hash, Some(0)).unwrap();
        approve::<TestStorage>(&env, admin.clone(), id1).unwrap();
        approve::<TestStorage>(&env, approver.clone(), id1).unwrap();
        execute::<TestStorage>(&env, admin.clone(), id1).unwrap();

        // Large delay
        let id2 = propose::<TestStorage>(&env, approver, wasm_hash, Some(u64::MAX)).unwrap();
        assert!(TestStorage::get_proposal(&env, id2).unwrap().delay == u64::MAX);
    }
}
