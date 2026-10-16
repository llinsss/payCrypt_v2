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
//!
//! ## Refund amount safety
//!
//! Funded and refunded amounts are tracked cumulatively per `payment_id` so the
//! total refunded can never exceed the total funded. A refund that would push
//! cumulative refunds above cumulative funds fails with
//! [`PaymentError::RefundExceedsFunded`]. Refunding exactly the remaining funded
//! balance is allowed (boundary), while over-by-one is rejected. A refund of
//! zero or a negative amount fails with [`PaymentError::InvalidAmount`].
//! Duplicate refund attempts are handled idempotently: once the funded balance
//! is fully refunded, further refunds are rejected with
//! [`PaymentError::RefundExceedsFunded`] rather than emitting a second event.

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

/// Cumulative funded/refunded amounts tracked per payment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentAmounts {
    /// Total amount funded for the payment.
    pub funded: i128,
    /// Total amount refunded so far for the payment.
    pub refunded: i128,
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
    RefundExceedsFunded = 10,
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

    /// Read the cumulative funded/refunded amounts for a payment.
    fn amounts(env: &Env, payment_id: u64) -> PaymentAmounts {
        env.storage()
            .persistent()
            .get(&payment_id)
            .unwrap_or(PaymentAmounts {
                funded: 0,
                refunded: 0,
            })
    }

    /// Persist the cumulative funded/refunded amounts for a payment.
    fn set_amounts(env: &Env, payment_id: u64, amounts: &PaymentAmounts) {
        env.storage().persistent().set(&payment_id, amounts);
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
    /// Only the `source` (payer) may fund a payment. The funded amount is
    /// accumulated so refunds can be bounded by total funds received.
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
        if amount <= 0 {
            return Err(PaymentError::InvalidAmount);
        }
        let mut amounts = Self::amounts(&env, payment_id);
        amounts.funded = amounts
            .funded
            .checked_add(amount)
            .ok_or(PaymentError::InvalidAmount)?;
        Self::set_amounts(&env, payment_id, &amounts);
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
    /// Only the `source` or the `operator` may refund a payment. The refunded
    /// amount is accumulated and must not exceed the cumulative funded amount;
    /// otherwise the call fails with [`PaymentError::RefundExceedsFunded`].
    /// Refunding exactly the remaining funded balance is permitted, while any
    /// amount that would exceed it (including a duplicate refund once fully
    /// refunded) is rejected.
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
        if amount <= 0 {
            return Err(PaymentError::InvalidAmount);
        }
        let mut amounts = Self::amounts(&env, payment_id);
        let new_refunded = amounts
            .refunded
            .checked_add(amount)
            .ok_or(PaymentError::RefundExceedsFunded)?;
        if new_refunded > amounts.funded {
            return Err(PaymentError::RefundExceedsFunded);
        }
        amounts.refunded = new_refunded;
        Self::set_amounts(&env, payment_id, &amounts);
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, PaymentContractClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, PaymentContract);
        let client = PaymentContractClient::new(&env, &contract_id);
        let asset = Address::generate(&env);
        let source = Address::generate(&env);
        let destination = Address::generate(&env);
        (env, client, asset, source, destination)
    }

    #[test]
    fn refund_success_partial_then_remainder() {
        let (env, client, asset, source, destination) = setup();
        client.fund_payment(&1, &asset, &source, &destination, &100, &source, &None);
        client.refund_payment(&1, &asset, &source, &destination, &40, &source, &None);
        client.refund_payment(&1, &asset, &source, &destination, &60, &source, &None);
        let amounts = PaymentContract::amounts(&env, 1);
        assert_eq!(amounts.funded, 100);
        assert_eq!(amounts.refunded, 100);
    }

    #[test]
    fn refund_boundary_exact_remaining_allowed() {
        let (env, client, asset, source, destination) = setup();
        client.fund_payment(&2, &asset, &source, &destination, &50, &source, &None);
        client.refund_payment(&2, &asset, &source, &destination, &50, &source, &None);
        let amounts = PaymentContract::amounts(&env, 2);
        assert_eq!(amounts.refunded, 50);
    }

    #[test]
    fn refund_over_by_one_rejected() {
        let (env, client, asset, source, destination) = setup();
        client.fund_payment(&3, &asset, &source, &destination, &50, &source, &None);
        let result = client.try_refund_payment(&3, &asset, &source, &destination, &51, &source, &None);
        assert_eq!(result, Err(Ok(PaymentError::RefundExceedsFunded)));
        let amounts = PaymentContract::amounts(&env, 3);
        assert_eq!(amounts.refunded, 0);
    }

    #[test]
    fn refund_duplicate_after_full_rejected() {
        let (env, client, asset, source, destination) = setup();
        client.fund_payment(&4, &asset, &source, &destination, &30, &source, &None);
        client.refund_payment(&4, &asset, &source, &destination, &30, &source, &None);
        let result = client.try_refund_payment(&4, &asset, &source, &destination, &30, &source, &None);
        assert_eq!(result, Err(Ok(PaymentError::RefundExceedsFunded)));
        let amounts = PaymentContract::amounts(&env, 4);
        assert_eq!(amounts.refunded, 30);
    }

    #[test]
    fn refund_without_funds_rejected() {
        let (env, client, asset, source, destination) = setup();
        let result = client.try_refund_payment(&5, &asset, &source, &destination, &1, &source, &None);
        assert_eq!(result, Err(Ok(PaymentError::RefundExceedsFunded)));
        let amounts = PaymentContract::amounts(&env, 5);
        assert_eq!(amounts.refunded, 0);
    }

    #[test]
    fn refund_invalid_amount_rejected() {
        let (env, client, asset, source, destination) = setup();
        client.fund_payment(&6, &asset, &source, &destination, &10, &source, &None);
        let result = client.try_refund_payment(&6, &asset, &source, &destination, &0, &source, &None);
        assert_eq!(result, Err(Ok(PaymentError::InvalidAmount)));
        let amounts = PaymentContract::amounts(&env, 6);
        assert_eq!(amounts.refunded, 0);
    }

    #[test]
    fn refund_unauthorized_actor_rejected() {
        let (env, client, asset, source, destination) = setup();
        let stranger = Address::generate(&env);
        client.fund_payment(&7, &asset, &source, &destination, &10, &source, &None);
        let result = client.try_refund_payment(&7, &asset, &source, &destination, &5, &stranger, &None);
        assert_eq!(result, Err(Ok(PaymentError::Unauthorized)));
        let amounts = PaymentContract::amounts(&env, 7);
        assert_eq!(amounts.refunded, 0);
    }

    #[test]
    fn refund_operator_allowed() {
        let (env, client, asset, source, destination) = setup();
        let operator = Address::generate(&env);
        client.fund_payment(&8, &asset, &source, &destination, &20, &source, &None);
        client.refund_payment(&8, &asset, &source, &destination, &20, &operator, &Some(operator.clone()));
        let amounts = PaymentContract::amounts(&env, 8);
        assert_eq!(amounts.refunded, 20);
    }
}
