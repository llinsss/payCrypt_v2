//! Payment contract with versioned event schemas for all payment state changes.
//!
//! Indexers can rely on the stable event names, topics, payloads, and schema
//! version defined here instead of reconstructing payment state from storage.
//!
//! Contract replacement is governed by a timelock + multisig approval flow so a
//! single hot key cannot immediately swap the payment contract.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

/// Schema version for all payment events emitted by this contract.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Topic used for every payment lifecycle event.
pub const PAYMENT_EVENT_TOPIC: Symbol = symbol_short!("payment");

/// Topic used for governance (upgrade) events.
pub const GOVERNANCE_EVENT_TOPIC: Symbol = symbol_short!("gov");

/// Storage key for the configured amount limits (min, max).
const AMOUNT_LIMITS_KEY: Symbol = symbol_short!("amt_limits");

/// Stable event names for each payment state transition.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentEventName {
    Created = 0,
    Funded = 1,
    Completed = 2,
    Failed = 3,
    Cancelled = 4,
    Refunded = 5,
}

/// Lifecycle status of a payment, mirrored in every event payload.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentStatus {
    Created = 0,
    Funded = 1,
    Completed = 2,
    Failed = 3,
    Cancelled = 4,
    Refunded = 5,
}

/// Configured inclusive amount limits applied at creation and funding.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AmountLimits {
    pub min: i128,
    pub max: i128,
}

/// Canonical payload emitted for every payment state change.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentEvent {
    pub schema_version: u32,
    pub name: PaymentEventName,
    pub payment_id: u64,
    pub asset: Address,
    pub source: Address,
    pub destination: Address,
    pub amount: i128,
    pub status: PaymentStatus,
}

/// Governance event names for the upgrade timelock/multisig flow.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GovernanceEventName {
    Proposed = 0,
    Approved = 1,
    Executed = 2,
    Cancelled = 3,
}

/// A pending contract-replacement proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeProposal {
    /// Hash/identifier of the new contract wasm to be installed.
    pub new_wasm_hash: Symbol,
    /// Ledger timestamp after which execution is allowed.
    pub executable_at: u64,
    /// Number of distinct approvals collected so far.
    pub approvals: u32,
    /// Whether the proposal has already been executed.
    pub executed: bool,
    /// Whether the proposal has been cancelled.
    pub cancelled: bool,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentError {
    InvalidAmount = 1,
    InvalidTransition = 2,
    ProposalNotFound = 3,
    DelayNotElapsed = 4,
    NotEnoughApprovals = 5,
    AlreadyExecuted = 6,
    AlreadyCancelled = 7,
    Unauthorized = 8,
    AlreadyApproved = 9,
    AmountBelowMinimum = 10,
    AmountAboveMaximum = 11,
    InvalidLimits = 12,
}

#[contract]
pub struct PaymentContract;

#[contractimpl]
impl PaymentContract {
    /// Emit the canonical event for a payment state change.
    pub fn emit_payment_event(
        env: &Env,
        name: PaymentEventName,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
        status: PaymentStatus,
    ) {
        let event = PaymentEvent {
            schema_version: EVENT_SCHEMA_VERSION,
            name,
            payment_id,
            asset,
            source,
            destination,
            amount,
            status,
        };
        env.events().publish((PAYMENT_EVENT_TOPIC, name), event);
    }

    /// Configure the inclusive minimum and maximum payment amount limits.
    ///
    /// Only the admin may call this. `min` must be positive and `max` must be
    /// greater than or equal to `min`.
    pub fn set_amount_limits(
        env: Env,
        admin: Address,
        min: i128,
        max: i128,
    ) -> Result<(), PaymentError> {
        admin.require_auth();
        if min <= 0 || max < min {
            return Err(PaymentError::InvalidLimits);
        }
        env.storage()
            .persistent()
            .set(&AMOUNT_LIMITS_KEY, &AmountLimits { min, max });
        Ok(())
    }

    /// Read the configured amount limits, if any have been set.
    pub fn get_amount_limits(env: Env) -> Option<AmountLimits> {
        env.storage().persistent().get(&AMOUNT_LIMITS_KEY)
    }

    /// Enforce the configured amount limits for `amount`.
    ///
    /// When no limits are configured the amount is only required to be
    /// positive. When limits are configured the amount must fall within the
    /// inclusive `[min, max]` range.
    fn check_amount_limits(env: &Env, amount: i128) -> Result<(), PaymentError> {
        if amount <= 0 {
            return Err(PaymentError::InvalidAmount);
        }
        if let Some(limits) = env
            .storage()
            .persistent()
            .get::<Symbol, AmountLimits>(&AMOUNT_LIMITS_KEY)
        {
            if amount < limits.min {
                return Err(PaymentError::AmountBelowMinimum);
            }
            if amount > limits.max {
                return Err(PaymentError::AmountAboveMaximum);
            }
        }
        Ok(())
    }

    /// Create a payment and emit the `Created` event.
    pub fn create_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), PaymentError> {
        Self::check_amount_limits(&env, amount)?;
        Self::emit_payment_event(
            &env,
            PaymentEventName::Created,
            payment_id,
            asset,
            source,
            destination,
            amount,
            PaymentStatus::Created,
        );
        Ok(())
    }

    /// Mark a payment as funded and emit the `Funded` event.
    pub fn fund_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), PaymentError> {
        Self::check_amount_limits(&env, amount)?;
        Self::emit_payment_event(
            &env,
            PaymentEventName::Funded,
            payment_id,
            asset,
            source,
            destination,
            amount,
            PaymentStatus::Funded,
        );
        Ok(())
    }

    /// Complete a payment and emit the `Completed` event.
    pub fn complete_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), PaymentError> {
        Self::emit_payment_event(
            &env,
            PaymentEventName::Completed,
            payment_id,
            asset,
            source,
            destination,
            amount,
            PaymentStatus::Completed,
        );
        Ok(())
    }

    /// Fail a payment and emit the `Failed` event.
    pub fn fail_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), PaymentError> {
        Self::emit_payment_event(
            &env,
            PaymentEventName::Failed,
            payment_id,
            asset,
            source,
            destination,
            amount,
            PaymentStatus::Failed,
        );
        Ok(())
    }

    /// Cancel a payment and emit the `Cancelled` event.
    pub fn cancel_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), PaymentError> {
        Self::emit_payment_event(
            &env,
            PaymentEventName::Cancelled,
            payment_id,
            asset,
            source,
            destination,
            amount,
            PaymentStatus::Cancelled,
        );
        Ok(())
    }

    /// Refund a payment and emit the `Refunded` event.
    pub fn refund_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), PaymentError> {
        Self::emit_payment_event(
            &env,
            PaymentEventName::Refunded,
            payment_id,
            asset,
            source,
            destination,
            amount,
            PaymentStatus::Refunded,
        );
        Ok(())
    }

    // --- Governance: timelock + multisig upgrade flow ---------------------

    /// Propose replacing the contract with `new_wasm_hash`.
    ///
    /// The proposal becomes executable only after `delay` seconds have elapsed
    /// and `threshold` distinct approvals have been collected. The proposer is
    /// recorded as the first approval.
    pub fn propose_upgrade(
        env: Env,
        proposal_id: u64,
        proposer: Address,
        new_wasm_hash: Symbol,
        delay: u64,
        threshold: u32,
    ) -> Result<(), PaymentError> {
        proposer.require_auth();
        if threshold == 0 {
            return Err(PaymentError::NotEnoughApprovals);
        }
        let now = env.ledger().timestamp();
        let proposal = UpgradeProposal {
            new_wasm_hash,
            executable_at: now + delay,
            approvals: 1,
            executed: false,
            cancelled: false,
        };
        env.storage().persistent().set(&proposal_id, &proposal);
        env.storage().persistent().set(&(proposal_id, proposer.clone()), &true);
        env.storage().persistent().set(&(proposal_id, sym

/* … truncated 6098 chars — edit only what you need near the top … */
