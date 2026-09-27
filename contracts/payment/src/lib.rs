//! Payment contract with versioned event schemas for all payment state changes.
//!
//! Indexers can rely on the stable event names, topics, payloads, and schema
//! version defined here instead of reconstructing payment state from storage.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

/// Schema version for all payment events emitted by this contract.
///
/// Bump this whenever an event topic or payload layout changes so indexers can
/// detect and adapt to breaking changes.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Topic used for every payment lifecycle event.
pub const PAYMENT_EVENT_TOPIC: Symbol = symbol_short!("payment");

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
///
/// Contains the payment ID, asset, source, destination, amount, and status so
/// indexers never need to read storage to reconstruct a transition.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentEvent {
    /// Schema version of this payload (see [`EVENT_SCHEMA_VERSION`]).
    pub schema_version: u32,
    /// Stable name of the transition that produced this event.
    pub name: PaymentEventName,
    /// Unique payment identifier.
    pub payment_id: u64,
    /// Asset contract address (or native asset wrapper) being transferred.
    pub asset: Address,
    /// Account funding the payment.
    pub source: Address,
    /// Account receiving the payment.
    pub destination: Address,
    /// Amount transferred, in the asset's smallest unit.
    pub amount: i128,
    /// Status of the payment after this transition.
    pub status: PaymentStatus,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentError {
    InvalidAmount = 1,
    InvalidTransition = 2,
}

#[contract]
pub struct PaymentContract;

#[contractimpl]
impl PaymentContract {
    /// Emit the canonical event for a payment state change.
    ///
    /// All transitions funnel through this helper so topics and payloads stay
    /// consistent and indexers can decode every event uniformly.
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
        env.events()
            .publish((PAYMENT_EVENT_TOPIC, name), event);
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
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events as _};
    use soroban_sdk::{vec, IntoVal, TryFromVal};

    fn setup() -> (Env, PaymentContractClient<'static>, Address, Address, Address) {
        let env = Env::default();
        let contract_id = env.register_contract(None, PaymentContract);
        let client = PaymentContractClient::new(&env, &contract_id);
        let asset = Address::generate(&env);
        let source = Address::generate(&env);
        let destination = Address::generate(&env);
        (env, client, asset, source, destination)
    }

    /// Decode the single emitted event and assert its topic and payload.
    fn assert_event(
        env: &Env,
        name: PaymentEventName,
        status: PaymentStatus,
        payment_id: u64,
        asset: &Address,
        source: &Address,
        destination: &Address,
        amount: i128,
    ) {
        let events = env.events().all();
        let (_, topics, data) = events.last().expect("expected an event");

        let expected_topics = vec![env, PAYMENT_EVENT_TOPIC.into_val(env), name.into_val(env)];
        assert_eq!(topics, expected_topics, "unexpected event topics");

        let decoded = PaymentEvent::try_from_val(env, &data).expect("payload must decode");
        assert_eq!(decoded.schema_version, EVENT_SCHEMA_VERSION);
        assert_eq!(decoded.name, name);
        assert_eq!(decoded.payment_id, payment_id);
        assert_eq!(&decoded.asset, asset);
        assert_eq!(&decoded.source, source);
        assert_eq!(&decoded.destination, destination);
        assert_eq!(decoded.amount, amount);
        assert_eq!(decoded.status, status);
    }

    #[test]
    fn decodes_created_event() {
        let (env, client, asset, source, destination) = setup();
        client.create_payment(&1, &asset, &source, &destination, &100);
        assert_event(
            &env,
            PaymentEventName::Created,
            PaymentStatus::Created,
            1,
            &asset,
            &source,
            &destination,
            100,
        );
    }

    #[test]
    fn decodes_funded_event() {
        let (env, client, asset, source, destination) = setup();
        client.fund_payment(&2, &asset, &source, &destination, &200);
        assert_event(
            &env,
            PaymentEventName::Funded,
            PaymentStatus::Funded,
            2,
            &asset,
            &source,
            &destination,
            200,
        );
    }

    #[test]
    fn decodes_completed_event() {
        let (env, client, asset, source, destination) = setup();
        client.complete_payment(&3, &asset, &source, &destination, &300);
        assert_event(
            &env,
            PaymentEventName::Completed,
            PaymentStatus::Completed,
            3,
            &asset,
            &source,
            &destination,
            300,
        );
    }

    #[test]
    fn decodes_failed_event() {
        let (env, client, asset, source, destination) = setup();
        client.fail_payment(&4, &asset, &source, &destination, &400);
        assert_event(
            &env,
            PaymentEventName::Failed,
            PaymentStatus::Failed,
            4,
            &asset,
            &source,
            &destination,
            400,
        );
    }

    #[test]
    fn decodes_cancelled_event() {
        let (env, client, asset, source, destination) = setup();
        client.cancel_payment(&5, &asset, &source, &destination, &500);
        assert_event(
            &env,
            PaymentEventName::Cancelled,
            PaymentStatus::Cancelled,
            5,
            &asset,
            &source,
            &destination,
            500,
        );
    }

    #[test]
    fn decodes_refunded_event() {
        let (env, client, asset, source, destination) = setup();
        client.refund_payment(&6, &asset, &source, &destination, &600);
        assert_event(
            &env,
            PaymentEventName::Refunded,
            PaymentStatus::Refunded,
            6,
            &asset,
            &source,
            &destination,
            600,
        );
    }
}
