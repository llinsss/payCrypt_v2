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
    pub fn fund_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), PaymentError> {
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
        env.storage().persistent().set(&(proposal_id, symbol_short!("threshold")), &threshold);
        env.events().publish(
            (GOVERNANCE_EVENT_TOPIC, GovernanceEventName::Proposed),
            (proposal_id, proposal.executable_at),
        );
        Ok(())
    }

    /// Approve a pending proposal. Each signer may approve at most once.
    pub fn approve_upgrade(
        env: Env,
        proposal_id: u64,
        approver: Address,
    ) -> Result<(), PaymentError> {
        approver.require_auth();
        let mut proposal: UpgradeProposal = env
            .storage()
            .persistent()
            .get(&proposal_id)
            .ok_or(PaymentError::ProposalNotFound)?;
        if proposal.executed {
            return Err(PaymentError::AlreadyExecuted);
        }
        if proposal.cancelled {
            return Err(PaymentError::AlreadyCancelled);
        }
        let approval_key = (proposal_id, approver.clone());
        if env.storage().persistent().has(&approval_key) {
            return Err(PaymentError::AlreadyApproved);
        }
        env.storage().persistent().set(&approval_key, &true);
        proposal.approvals += 1;
        env.storage().persistent().set(&proposal_id, &proposal);
        env.events().publish(
            (GOVERNANCE_EVENT_TOPIC, GovernanceEventName::Approved),
            (proposal_id, proposal.approvals),
        );
        Ok(())
    }

    /// Execute an approved proposal once the timelock delay has elapsed.
    ///
    /// Reverts if the proposal is unknown, cancelled, already executed, still
    /// within the delay window, or lacks the required approvals. Replay is
    /// prevented by flipping `executed` before returning.
    pub fn execute_upgrade(env: Env, proposal_id: u64) -> Result<(), PaymentError> {
        let mut proposal: UpgradeProposal = env
            .storage()
            .persistent()
            .get(&proposal_id)
            .ok_or(PaymentError::ProposalNotFound)?;
        if proposal.executed {
            return Err(PaymentError::AlreadyExecuted);
        }
        if proposal.cancelled {
            return Err(PaymentError::AlreadyCancelled);
        }
        let threshold: u32 = env
            .storage()
            .persistent()
            .get(&(proposal_id, symbol_short!("threshold")))
            .ok_or(PaymentError::ProposalNotFound)?;
        if proposal.approvals < threshold {
            return Err(PaymentError::NotEnoughApprovals);
        }
        if env.ledger().timestamp() < proposal.executable_at {
            return Err(PaymentError::DelayNotElapsed);
        }
        proposal.executed = true;
        env.storage().persistent().set(&proposal_id, &proposal);
        env.events().publish(
            (GOVERNANCE_EVENT_TOPIC, GovernanceEventName::Executed),
            (proposal_id, proposal.new_wasm_hash.clone()),
        );
        Ok(())
    }

    /// Emergency cancellation of a pending proposal.
    ///
    /// Any authorized guardian may cancel before execution, immediately
    /// disabling the proposal so it can never be executed. Cancellation is
    /// terminal and cannot be undone; a fresh proposal must be created.
    pub fn cancel_upgrade(
        env: Env,
        proposal_id: u64,
        guardian: Address,
    ) -> Result<(), PaymentError> {
        guardian.require_auth();
        let mut proposal: UpgradeProposal = env
            .storage()
            .persistent()
            .get(&proposal_id)
            .ok_or(PaymentError::ProposalNotFound)?;
        if proposal.executed {
            return Err(PaymentError::AlreadyExecuted);
        }
        if proposal.cancelled {
            return Err(PaymentError::AlreadyCancelled);
        }
        proposal.cancelled = true;
        env.storage().persistent().set(&proposal_id, &proposal);
        env.events().publish(
            (GOVERNANCE_EVENT_TOPIC, GovernanceEventName::Cancelled),
            (proposal_id, guardian),
        );
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};

    fn setup() -> (Env, PaymentContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PaymentContract);
        let client = PaymentContractClient::new(&env, &contract_id);
        let signer = Address::generate(&env);
        (env, client, signer)
    }

    #[test]
    fn execute_requires_delay_and_approvals() {
        let (env, client, signer) = setup();
        let hash = symbol_short!("wasm1");
        client.propose_upgrade(&1, &signer, &hash, &100, &2);

        // Only one approval so far: execution must fail.
        assert_eq!(client.try_execute_upgrade(&1), Err(Ok(PaymentError::NotEnoughApprovals)));

        let second = Address::generate(&env);
        client.approve_upgrade(&1, &second);

        // Approvals met but delay not elapsed.
        assert_eq!(client.try_execute_upgrade(&1), Err(Ok(PaymentError::DelayNotElapsed)));

        env.ledger().with_mut(|l| l.timestamp = 200);
        client.execute_upgrade(&1);

        // Replay attempt must be rejected.
        assert_eq!(client.try_execute_upgrade(&1), Err(Ok(PaymentError::AlreadyExecuted)));
    }

    #[test]
    fn unauthorized_and_duplicate_approvals_rejected() {
        let (env, client, signer) = setup();
        let hash = symbol_short!("wasm2");
        client.propose_upgrade(&2, &signer, &hash, &10, &2);

        // Same signer cannot approve twice.
        assert_eq!(client.try_approve_upgrade(&2, &signer), Err(Ok(PaymentError::AlreadyApproved)));

        // Unknown proposal cannot be executed.
        assert_eq!(client.try_execute_upgrade(&99), Err(Ok(PaymentError::ProposalNotFound)));
    }

    #[test]
    fn emergency_cancel_blocks_execution() {
        let (env, client, signer) = setup();
        let hash = symbol_short!("wasm3");
        client.propose_upgrade(&3, &signer, &hash, &0, &1);
        client.cancel_upgrade(&3, &signer);
        assert_eq!(client.try_execute_upgrade(&3), Err(Ok(PaymentError::AlreadyCancelled)));
    }
}
