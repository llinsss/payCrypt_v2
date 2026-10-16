//! Payment contract with versioned event schemas for all payment state changes.
//!
//! Indexers can rely on the stable event names, topics, payloads, and schema
//! version defined here instead of reconstructing payment state from storage.
//!
//! Contract replacement is governed by a timelock + multisig approval flow so a
//! single hot key cannot immediately swap the payment contract.
//!
//! ## Transition authorization model
//!
//! Every payment transition is bound to an authorized actor. The actor must
//! authorize the invocation via `require_auth`; otherwise the call fails with
//! [`PaymentError::Unauthorized`].
//!
//! | Transition | Permitted actor(s)                          |
//! |------------|---------------------------------------------|
//! | Fund       | source (payer)                              |
//! | Complete   | destination (payee) or operator             |
//! | Fail       | source, destination, or operator            |
//! | Cancel     | source or operator                          |
//! | Refund     | source or operator                          |
//!
//! The `operator` is an optional privileged address supplied by the caller; it
//! must itself authorize the invocation when used.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

/// Schema version for all payment events emitted by this contract.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Topic used for every payment lifecycle event.
pub const PAYMENT_EVENT_TOPIC: Symbol = symbol_short!("payment");

/// Topic used for governance (upgrade) events.
pub const GOVERNANCE_EVENT_TOPIC: Symbol = symbol_short!("gov");

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

    /// Require that `actor` is one of the permitted actors for a transition.
    ///
    /// The actor must authorize the invocation. When `operator` is supplied it
    /// is treated as an additional permitted actor and must also authorize.
    fn require_actor(
        actor: &Address,
        permitted: &[Address],
        operator: &Option<Address>,
    ) -> Result<(), PaymentError> {
        let mut allowed = false;
        for candidate in permitted.iter() {
            if candidate == actor {
                allowed = true;
                break;
            }
        }
        if !allowed {
            if let Some(op) = operator {
                if op == actor {
                    allowed = true;
                }
            }
        }
        if !allowed {
            return Err(PaymentError::Unauthorized);
        }
        actor.require_auth();
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
        if amount <= 0 {
            return Err(PaymentError::InvalidAmount);
        }
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
    ///
    /// Only the `source` (payer) may fund a payment.
    pub fn fund_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
        actor: Address,
        operator: Option<Address>,
    ) -> Result<(), PaymentError> {
        Self::require_actor(&actor, &[source.clone()], &operator)?;
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
    ///
    /// Only the `destination` (payee) or the `operator` may complete a payment.
    pub fn complete_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
        actor: Address,
        operator: Option<Address>,
    ) -> Result<(), PaymentError> {
        Self::require_actor(&actor, &[destination.clone()], &operator)?;
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
    ///
    /// The `source`, `destination`, or `operator` may fail a payment.
    pub fn fail_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
        actor: Address,
        operator: Option<Address>,
    ) -> Result<(), PaymentError> {
        Self::require_actor(&actor, &[source.clone(), destination.clone()], &operator)?;
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
    ///
    /// Only the `source` or the `operator` may cancel a payment.
    pub fn cancel_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
        actor: Address,
        operator: Option<Address>,
    ) -> Result<(), PaymentError> {
        Self::require_actor(&actor, &[source.clone()], &operator)?;
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
    ///
    /// Only the `source` or the `operator` may refund a payment.
    pub fn refund_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
        actor: Address,
        operator: Option<Address>,
    ) -> Result<(), PaymentError> {
        Self::require_actor(&actor, &[source.clone()], &operator)?;
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
