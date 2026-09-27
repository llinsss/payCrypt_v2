//! Core payment types and versioned event schemas for the payment contract.
//!
//! Indexers rely on the event schemas defined here to reconstruct payment
//! state without performing storage reads. Every payment state transition
//! emits exactly one event whose topic and payload are stable and versioned.

use soroban_sdk::{contracttype, Address, BytesN, Env, Symbol, Vec};

/// Current schema version for all payment events.
///
/// Bump this whenever an event topic or payload layout changes so that
/// indexers can detect and adapt to breaking changes.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Canonical event names emitted by the payment contract.
///
/// These names are used as the first topic of every event so that indexers
/// can filter by transition without decoding the payload.
pub mod event_names {
    use soroban_sdk::{symbol_short, Symbol};

    /// Payment created / initiated.
    pub fn created() -> Symbol {
        symbol_short!("pay_created")
    }

    /// Payment funded by the source.
    pub fn funded() -> Symbol {
        symbol_short!("pay_funded")
    }

    /// Payment completed / settled to the destination.
    pub fn completed() -> Symbol {
        symbol_short!("pay_completed")
    }

    /// Payment failed.
    pub fn failed() -> Symbol {
        symbol_short!("pay_failed")
    }

    /// Payment cancelled.
    pub fn cancelled() -> Symbol {
        symbol_short!("pay_cancelled")
    }

    /// Payment refunded to the source.
    pub fn refunded() -> Symbol {
        symbol_short!("pay_refunded")
    }
}

/// Lifecycle status of a payment.
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

/// Stable, versioned payload emitted for every payment state change.
///
/// Contains the payment ID, asset, source, destination, amount, and the
/// resulting status so indexers never need to read contract storage.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentEvent {
    /// Schema version of this payload (see [`EVENT_SCHEMA_VERSION`]).
    pub schema_version: u32,
    /// Unique payment identifier.
    pub payment_id: BytesN<32>,
    /// Asset contract address (or native asset sentinel).
    pub asset: Address,
    /// Source account that funds the payment.
    pub source: Address,
    /// Destination account that receives the payment.
    pub destination: Address,
    /// Amount transferred, in the asset's smallest unit.
    pub amount: i128,
    /// Resulting payment status after this transition.
    pub status: PaymentStatus,
}

impl PaymentEvent {
    /// Build a versioned event payload for a payment state transition.
    pub fn new(
        payment_id: BytesN<32>,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
        status: PaymentStatus,
    ) -> Self {
        Self {
            schema_version: EVENT_SCHEMA_VERSION,
            payment_id,
            asset,
            source,
            destination,
            amount,
            status,
        }
    }

    /// Topics emitted alongside this payload: `(event_name, schema_version)`.
    pub fn topics(&self, env: &Env, name: Symbol) -> Vec<Symbol> {
        let mut topics = Vec::new(env);
        topics.push_back(name);
        topics.push_back(Symbol::new(env, "v1"));
        topics
    }
}

/// Emit the event for a payment state transition.
///
/// The first topic is the transition name, the second is the schema version
/// tag, and the payload is the full [`PaymentEvent`].
fn emit_transition(env: &Env, name: Symbol, event: &PaymentEvent) {
    env.events().publish(event.topics(env, name), event.clone());
}

/// Emit the `created` event for a newly initiated payment.
pub fn emit_created(env: &Env, event: &PaymentEvent) {
    emit_transition(env, event_names::created(), event);
}

/// Emit the `funded` event once the source has funded the payment.
pub fn emit_funded(env: &Env, event: &PaymentEvent) {
    emit_transition(env, event_names::funded(), event);
}

/// Emit the `completed` event once the payment settles to the destination.
pub fn emit_completed(env: &Env, event: &PaymentEvent) {
    emit_transition(env, event_names::completed(), event);
}

/// Emit the `failed` event when a payment cannot be completed.
pub fn emit_failed(env: &Env, event: &PaymentEvent) {
    emit_transition(env, event_names::failed(), event);
}

/// Emit the `cancelled` event when a payment is cancelled before settlement.
pub fn emit_cancelled(env: &Env, event: &PaymentEvent) {
    emit_transition(env, event_names::cancelled(), event);
}

/// Emit the `refunded` event when funds are returned to the source.
pub fn emit_refunded(env: &Env, event: &PaymentEvent) {
    emit_transition(env, event_names::refunded(), event);
}

#[cfg(test)]
mod event_fixtures {
    use super::*;
    use soroban_sdk::testutils::Events;
    use soroban_sdk::{Env, IntoVal};

    fn sample(env: &Env, status: PaymentStatus) -> PaymentEvent {
        PaymentEvent::new(
            BytesN::from_array(env, &[7u8; 32]),
            Address::generate(env),
            Address::generate(env),
            Address::generate(env),
            1_000_i128,
            status,
        )
    }

    fn assert_transition(
        env: &Env,
        name: Symbol,
        status: PaymentStatus,
        emit: fn(&Env, &PaymentEvent),
    ) {
        let event = sample(env, status);
        emit(env, &event);

        let events = env.events().all();
        let (_, topics, data) = events.last().unwrap();

        let expected_topics: Vec<Symbol> = event.topics(env, name);
        assert_eq!(topics, expected_topics.into_val(env));

        let decoded: PaymentEvent = data.into_val(env);
        assert_eq!(decoded, event);
        assert_eq!(decoded.schema_version, EVENT_SCHEMA_VERSION);
        assert_eq!(decoded.status, status);
    }

    #[test]
    fn decodes_created_transition() {
        let env = Env::default();
        assert_transition(&env, event_names::created(), PaymentStatus::Created, emit_created);
    }

    #[test]
    fn decodes_funded_transition() {
        let env = Env::default();
        assert_transition(&env, event_names::funded(), PaymentStatus::Funded, emit_funded);
    }

    #[test]
    fn decodes_completed_transition() {
        let env = Env::default();
        assert_transition(&env, event_names::completed(), PaymentStatus::Completed, emit_completed);
    }

    #[test]
    fn decodes_failed_transition() {
        let env = Env::default();
        assert_transition(&env, event_names::failed(), PaymentStatus::Failed, emit_failed);
    }

    #[test]
    fn decodes_cancelled_transition() {
        let env = Env::default();
        assert_transition(&env, event_names::cancelled(), PaymentStatus::Cancelled, emit_cancelled);
    }

    #[test]
    fn decodes_refunded_transition() {
        let env = Env::default();
        assert_transition(&env, event_names::refunded(), PaymentStatus::Refunded, emit_refunded);
    }
}
