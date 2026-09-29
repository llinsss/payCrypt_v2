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
//!
//! The module is intentionally storage-agnostic: it operates on a
//! `GovernanceStorage` trait so it can be wired into the payment contract's
//! existing persistent storage without changing its layout.

use soroban_sdk::{contracttype, Address, BytesN, Env};

/// A pending contract replacement proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeProposal {
    /// Unique, monotonically increasing proposal id.
    pub id: u64,
    /// Account that created the proposal.
    pub proposer: Address,
    /// New contract wasm hash to be installed on execution.
    pub wasm_hash: BytesN<32>,
    /// Ledger timestamp (seconds) at which the proposal was created.
    pub created_at: u64,
    /// Delay (seconds) that must elapse before execution is allowed.
    pub delay: u64,
    /// Number of distinct approvals collected so far.
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
    InvalidThreshold = 9,
}

/// Storage abstraction so the governance module can be embedded in the
/// payment contract without dictating its storage layout.
pub trait GovernanceStorage {
    fn get_config(env: &Env) -> Option<GovernanceConfig>;
    fn set_config(env: &Env, config: &GovernanceConfig);
    fn next_proposal_id(env: &Env) -> u64;
    fn get_proposal(env: &Env, id: u64) -> Option<UpgradeProposal>;
    fn set_proposal(env: &Env, proposal: &UpgradeProposal);
    fn is_approver(env: &Env, who: &Address) -> bool;
    fn has_approved(env: &Env, id: u64, who: &Address) -> bool;
    fn record_approval(env: &Env, id: u64, who: &Address);
}

/// Initialize governance with an admin, approval threshold and default delay.
pub fn initialize<S: GovernanceStorage>(
    env: &Env,
    admin: Address,
    threshold: u32,
    default_delay: u64,
) -> Result<(), GovernanceError> {
    if threshold == 0 {
        return Err(GovernanceError::InvalidThreshold);
    }
    admin.require_auth();
    S::set_config(
        env,
        &GovernanceConfig {
            admin,
            threshold,
            default_delay,
        },
    );
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

    let id = S::next_proposal_id(env);
    let proposal = UpgradeProposal {
        id,
        proposer,
        wasm_hash,
        created_at: env.ledger().timestamp(),
        delay: delay.unwrap_or(config.default_delay),
        approvals: 0,
        executed: false,
        cancelled: false,
    };
    S::set_proposal(env, &proposal);
    Ok(id)
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
/// Returns the wasm hash to install. Replay attempts (executing twice) and
/// unauthorized executions are rejected.
pub fn execute<S: GovernanceStorage>(
    env: &Env,
    executor: Address,
    id: u64,
) -> Result<BytesN<32>, GovernanceError> {
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
    if proposal.approvals < config.threshold {
        return Err(GovernanceError::ThresholdNotMet);
    }

    let now = env.ledger().timestamp();
    if now < proposal.created_at.saturating_add(proposal.delay) {
        return Err(GovernanceError::DelayNotElapsed);
    }

    // Mark executed before returning so a re-entrant call cannot replay.
    proposal.executed = true;
    S::set_proposal(env, &proposal);
    Ok(proposal.wasm_hash)
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
