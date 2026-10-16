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

/// Actor permitted to drive a given payment transition.
///
/// The authorization model binds each transition to exactly one of the
/// payment's participants so that no unrelated caller can move funds or
/// mutate lifecycle state:
///
/// | Transition | Permitted actor |
/// |------------|-----------------|
/// | `fund`     | source          |
/// | `complete` | destination     |
/// | `fail`     | destination     |
/// | `cancel`   | source          |
/// | `refund`   | source          |
///
/// The `operator` role is reserved for future delegated flows and is not
/// currently accepted by any transition.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentActor {
    /// The account that funds the payment.
    Source = 0,
    /// The account that receives the payment.
    Destination = 1,
    /// A delegated operator (reserved; not yet authorized for any transition).
    Operator = 2,
}

/// Error returned when a caller is not authorized for a transition.
///
/// Exposed as a stable code so callers and indexers can distinguish an
/// authorization failure from other contract errors.
pub const ERR_UNAUTHORIZED_ACTOR: u32 = 935;

/// Return the actor permitted to drive the given transition.
///
/// This is the single source of truth for the authorization model; contract
/// transition handlers must consult it before mutating state.
pub fn permitted_actor(status: PaymentStatus) -> Option<PaymentActor> {
    match status {
        PaymentStatus::Funded => Some(PaymentActor::Source),
        PaymentStatus::Completed => Some(PaymentActor::Destination),
        PaymentStatus::Failed => Some(PaymentActor::Destination),
        PaymentStatus::Cancelled => Some(PaymentActor::Source),
        PaymentStatus::Refunded => Some(PaymentActor::Source),
        // `Created` is the initial state and is not a driven transition.
        PaymentStatus::Created => None,
    }
}

/// Resolve the address that corresponds to `actor` for a payment event.
fn actor_address(event: &PaymentEvent, actor: PaymentActor) -> Option<Address> {
    match actor {
        PaymentActor::Source => Some(event.source.clone()),
        PaymentActor::Destination => Some(event.destination.clone()),
        // No operator is bound to a payment yet, so it can never be authorized.
        PaymentActor::Operator => None,
    }
}

/// Enforce that `caller` is authorized to drive the transition to `status`.
///
/// Returns `Ok(())` when the caller matches the permitted actor for the
/// transition, and `Err(ERR_UNAUTHORIZED_ACTOR)` otherwise. Transitions with
/// no permitted actor (e.g. `Created`) are always rejected.
pub fn authorize_transition(
    event: &PaymentEvent,
    status: PaymentStatus,
    caller: &Address,
) -> Result<(), u32> {
    let actor = permitted_actor(status).ok_or(ERR_UNAUTHORIZED_ACTOR)?;
    let expected = actor_address(event, actor).ok_or(ERR_UNAUTHORIZED_ACTOR)?;
    if &expected == caller {
        Ok(())
    } else {
        Err(ERR_UNAUTHORIZED_ACTOR)
    }
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

    /// The authorization model binds each transition to a single actor.
    #[test]
    fn permitted_actor_mapping() {
        assert_eq!(permitted_actor(PaymentStatus::Funded), Some(PaymentActor::Source));
        assert_eq!(
            permitted_actor(PaymentStatus::Completed),
            Some(PaymentActor::Destination)
        );
        assert_eq!(
            permitted_actor(PaymentStatus::Failed),
            Some(PaymentActor::Destination)
        );
        assert_eq!(
            permitted_actor(PaymentStatus::Cancelled),
            Some(PaymentActor::Source)
        );
        assert_eq!(
            permitted_actor(PaymentStatus::Refunded),
            Some(PaymentActor::Source)
        );
        // `Created` is not a driven transition.
        assert_eq!(permitted_actor(PaymentStatus::Created), None);
    }

    /// Success: the permitted actor is authorized for each transition.
    #[test]
    fn authorize_success() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Funded);
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Funded, &event.source),
            Ok(())
        );
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Completed, &event.destination),
            Ok(())
        );
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Failed, &event.destination),
            Ok(())
        );
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Cancelled, &event.source),
            Ok(())
        );
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Refunded, &event.source),
            Ok(())
        );
    }

    /// Authorization failure: the wrong participant is rejected.
    #[test]
    fn authorize_wrong_actor_rejected() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Funded);
        // Destination cannot fund.
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Funded, &event.destination),
            Err(ERR_UNAUTHORIZED_ACTOR)
        );
        // Source cannot complete or fail.
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Completed, &event.source),
            Err(ERR_UNAUTHORIZED_ACTOR)
        );
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Failed, &event.source),
            Err(ERR_UNAUTHORIZED_ACTOR)
        );
        // Destination cannot cancel or refund.
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Cancelled, &event.destination),
            Err(ERR_UNAUTHORIZED_ACTOR)
        );
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Refunded, &event.destination),
            Err(ERR_UNAUTHORIZED_ACTOR)
        );
    }

    /// Boundary: an unrelated third party is rejected for every transition.
    #[test]
    fn authorize_unrelated_caller_rejected() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Funded);
        let stranger = Address::generate(&env);
        for status in [
            PaymentStatus::Funded,
            PaymentStatus::Completed,
            PaymentStatus::Failed,
            PaymentStatus::Cancelled,
            PaymentStatus::Refunded,
        ] {
            assert_eq!(
                authorize_transition(&event, status, &stranger),
                Err(ERR_UNAUTHORIZED_ACTOR)
            );
        }
    }

    /// Failure: transitions with no permitted actor are always rejected.
    #[test]
    fn authorize_created_rejected() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Created);
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Created, &event.source),
            Err(ERR_UNAUTHORIZED_ACTOR)
        );
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Created, &event.destination),
            Err(ERR_UNAUTHORIZED_ACTOR)
        );
    }
}
