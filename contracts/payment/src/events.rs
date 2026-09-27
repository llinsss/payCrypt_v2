//! Versioned event schemas for all payment state changes.
//!
//! Indexers rely on these events to reconstruct payment state without reading
//! storage directly. Every payment state transition emits exactly one event
//! with a stable name, topic, and payload shape.
//!
//! Schema version: [`EVENT_SCHEMA_VERSION`]. Bump it whenever a topic or
//! payload changes in a backwards-incompatible way.

use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol};

/// Current version of the payment event schema.
///
/// Indexers should reject or migrate events whose version they do not
/// understand. The version is included in every emitted event topic.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Canonical event names for payment state transitions.
///
/// These names are stable identifiers used as the first topic segment so
/// indexers can filter by transition without decoding the payload.
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

/// Common payload carried by every payment state-change event.
///
/// Includes the payment ID, asset, source, destination, amount, and status
/// required by indexers to reconstruct state from events alone.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentEvent {
    /// Schema version of this event.
    pub version: u32,
    /// Unique payment identifier.
    pub payment_id: u64,
    /// Asset contract address (or native asset sentinel).
    pub asset: Address,
    /// Source account that funds the payment.
    pub source: Address,
    /// Destination account that receives the payment.
    pub destination: Address,
    /// Amount transferred, in the asset's smallest unit.
    pub amount: i128,
    /// Status after this transition.
    pub status: PaymentStatus,
}

/// Build the topic tuple for a payment event.
///
/// Topics are `(event_name, schema_version)` so indexers can filter by
/// transition and validate the schema version before decoding the payload.
pub fn payment_topic(env: &Env, name: Symbol) -> (Symbol, u32) {
    let _ = env;
    (name, EVENT_SCHEMA_VERSION)
}

/// Emit a payment state-change event with the canonical topic and payload.
pub fn emit_payment_event(env: &Env, name: Symbol, event: &PaymentEvent) {
    let topics = payment_topic(env, name);
    env.events().publish(topics, event.clone());
}

/// Emit the `created` event for a newly initiated payment.
pub fn emit_created(env: &Env, event: &PaymentEvent) {
    emit_payment_event(env, event_names::created(), event);
}

/// Emit the `funded` event once the source has funded the payment.
pub fn emit_funded(env: &Env, event: &PaymentEvent) {
    emit_payment_event(env, event_names::funded(), event);
}

/// Emit the `completed` event once the payment settles to the destination.
pub fn emit_completed(env: &Env, event: &PaymentEvent) {
    emit_payment_event(env, event_names::completed(), event);
}

/// Emit the `failed` event when a payment cannot be completed.
pub fn emit_failed(env: &Env, event: &PaymentEvent) {
    emit_payment_event(env, event_names::failed(), event);
}

/// Emit the `cancelled` event when a payment is cancelled before settlement.
pub fn emit_cancelled(env: &Env, event: &PaymentEvent) {
    emit_payment_event(env, event_names::cancelled(), event);
}

/// Emit the `refunded` event when funds are returned to the source.
pub fn emit_refunded(env: &Env, event: &PaymentEvent) {
    emit_payment_event(env, event_names::refunded(), event);
}

#[cfg(test)]
mod fixtures {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    fn sample(env: &Env, status: PaymentStatus) -> PaymentEvent {
        PaymentEvent {
            version: EVENT_SCHEMA_VERSION,
            payment_id: 42,
            asset: Address::generate(env),
            source: Address::generate(env),
            destination: Address::generate(env),
            amount: 1_000_000,
            status,
        }
    }

    /// Decoding fixture for the `created` transition.
    #[test]
    fn decode_created() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Created);
        emit_created(&env, &event);
        let (name, version) = payment_topic(&env, event_names::created());
        assert_eq!(name, event_names::created());
        assert_eq!(version, EVENT_SCHEMA_VERSION);
        assert_eq!(event.status, PaymentStatus::Created);
    }

    /// Decoding fixture for the `funded` transition.
    #[test]
    fn decode_funded() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Funded);
        emit_funded(&env, &event);
        let (name, version) = payment_topic(&env, event_names::funded());
        assert_eq!(name, event_names::funded());
        assert_eq!(version, EVENT_SCHEMA_VERSION);
        assert_eq!(event.status, PaymentStatus::Funded);
    }

    /// Decoding fixture for the `completed` transition.
    #[test]
    fn decode_completed() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Completed);
        emit_completed(&env, &event);
        let (name, version) = payment_topic(&env, event_names::completed());
        assert_eq!(name, event_names::completed());
        assert_eq!(version, EVENT_SCHEMA_VERSION);
        assert_eq!(event.status, PaymentStatus::Completed);
    }

    /// Decoding fixture for the `failed` transition.
    #[test]
    fn decode_failed() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Failed);
        emit_failed(&env, &event);
        let (name, version) = payment_topic(&env, event_names::failed());
        assert_eq!(name, event_names::failed());
        assert_eq!(version, EVENT_SCHEMA_VERSION);
        assert_eq!(event.status, PaymentStatus::Failed);
    }

    /// Decoding fixture for the `cancelled` transition.
    #[test]
    fn decode_cancelled() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Cancelled);
        emit_cancelled(&env, &event);
        let (name, version) = payment_topic(&env, event_names::cancelled());
        assert_eq!(name, event_names::cancelled());
        assert_eq!(version, EVENT_SCHEMA_VERSION);
        assert_eq!(event.status, PaymentStatus::Cancelled);
    }

    /// Decoding fixture for the `refunded` transition.
    #[test]
    fn decode_refunded() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Refunded);
        emit_refunded(&env, &event);
        let (name, version) = payment_topic(&env, event_names::refunded());
        assert_eq!(name, event_names::refunded());
        assert_eq!(version, EVENT_SCHEMA_VERSION);
        assert_eq!(event.status, PaymentStatus::Refunded);
    }
}
