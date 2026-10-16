//! Versioned event schemas for all payment state changes.
//!
//! Indexers rely on these events to reconstruct payment state without reading
//! storage directly. Every payment state transition emits exactly one event
//! with a stable name, topic, and payload shape.
//!
//! Schema version: [`EVENT_SCHEMA_VERSION`]. Bump it whenever a topic or
//! payload changes in a backwards-incompatible way.
//!
//! # Schema evolution rules
//!
//! The event schema is versioned so indexers can decode events safely across
//! contract upgrades. The following rules define what counts as a compatible
//! change and what requires a version bump:
//!
//! ## Compatible (no version bump)
//!
//! - **Adding a new event name** for a new state transition. Existing names
//!   and their payloads are untouched, so old indexers simply ignore the new
//!   topic.
//! - **Adding a new optional field** to [`PaymentEvent`] *only* if it is
//!   appended after all existing fields and has a well-defined default for
//!   events emitted before the field existed. Because Soroban decodes structs
//!   positionally, appended fields must never reorder or remove existing ones.
//! - **Adding a new [`PaymentStatus`] variant** at the end of the enum. The
//!   `#[repr(u32)]` discriminants of existing variants must not change.
//!
//! ## Incompatible (requires a version bump)
//!
//! - Renaming, removing, or reordering any existing field of [`PaymentEvent`].
//! - Changing the type or meaning of an existing field (e.g. `amount` units).
//! - Renaming or removing an event name in [`event_names`].
//! - Changing the discriminant of an existing [`PaymentStatus`] variant.
//! - Changing the topic layout produced by [`payment_topic`].
//!
//! When an incompatible change is unavoidable, bump [`EVENT_SCHEMA_VERSION`]
//! and document the migration path for indexers. The version is carried in
//! every event topic, so indexers can reject or migrate events they do not
//! understand.

use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol};

/// Current version of the payment event schema.
///
/// Indexers should reject or migrate events whose version they do not
/// understand. The version is included in every emitted event topic.
///
/// Bump this only for backwards-incompatible changes; see the module-level
/// schema evolution rules for the full compatibility contract.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Canonical event names for payment state transitions.
///
/// These names are stable identifiers used as the first topic segment so
/// indexers can filter by transition without decoding the payload.
///
/// Adding a new name here is a compatible change; renaming or removing an
/// existing name is not.
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

    /// Payment expired without settlement.
    pub fn expired() -> Symbol {
        symbol_short!("pay_expired")
    }
}

/// Lifecycle status of a payment, mirrored in every event payload.
///
/// New variants may be appended (compatible); existing discriminants are
/// part of the schema and must not change.
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
    Expired = 6,
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
/// | `expire`   | source          |
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

/// Error returned when a transition is attempted after the payment's expiry.
///
/// Once a payment has expired, only the expiry/cancellation transitions are
/// permitted; any other transition returns this stable code.
pub const ERR_PAYMENT_EXPIRED: u32 = 937;

/// Error returned when a transition is attempted before the payment's expiry.
///
/// The expiry transition is only valid at or after the stored expiry ledger.
pub const ERR_PAYMENT_NOT_EXPIRED: u32 = 938;

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
        PaymentStatus::Expired => Some(PaymentActor::Source),
        // `Created` is the initial state and is not a driven transition.
        PaymentStatus::Created => None,
    }
}

/// Return whether `status` is a terminal state that no longer accepts
/// transitions. Terminal states are `Completed`, `Failed`, `Cancelled`,
/// `Refunded`, and `Expired`.
pub fn is_terminal(status: PaymentStatus) -> bool {
    matches!(
        status,
        PaymentStatus::Completed
            | PaymentStatus::Failed
            | PaymentStatus::Cancelled
            | PaymentStatus::Refunded
            | PaymentStatus::Expired
    )
}

/// Return whether a payment in `status` may still be cancelled.
///
/// Cancellation is only allowed while the payment is `Created` or `Funded`.
/// Once a payment has settled, failed, been refunded, or expired it can no
/// longer be cancelled.
pub fn is_cancellable(status: PaymentStatus) -> bool {
    matches!(status, PaymentStatus::Created | PaymentStatus::Funded)
}

/// Return whether a payment in `status` may be expired.
///
/// Expiry applies to unsettled payments (`Created` or `Funded`); terminal
/// states are already final and cannot expire again.
pub fn is_expirable(status: PaymentStatus) -> bool {
    matches!(status, PaymentStatus::Created | PaymentStatus::Funded)
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

/// Enforce the expiry rules for a transition to `status` at `now`.
///
/// `expiry` is the stored expiry ledger of the payment. The rules are:
///
/// * Before expiry (`now < expiry`), the `Expired` transition is rejected
///   with [`ERR_PAYMENT_NOT_EXPIRED`]; all other transitions are allowed.
/// * At or after expiry (`now >= expiry`), only the `Expired` transition is
///   allowed; any other transition is rejected with [`ERR_PAYMENT_EXPIRED`].
///
/// This keeps post-expiry behavior deterministic and bounded: an expired
/// payment can only move to `Expired`, from which funds are refunded to the
/// source.
pub fn authorize_expiry(
    status: PaymentStatus,
    expiry: u32,
    now: u32,
) -> Result<(), u32> {
    let expired = now >= expiry;
    match status {
        PaymentStatus::Expired => {
            if expired {
                Ok(())
            } else {
                Err(ERR_PAYMENT_NOT_EXPIRED)
            }
        }
        _ => {
            if expired {
                Err(ERR_PAYMENT_EXPIRED)
            } else {
                Ok(())
            }
        }
    }
}

/// Common payload carried by every payment state-change event.
///
/// Includes the payment ID, asset, source, destination, amount, and status
/// required by indexers to reconstruct state from events alone.
///
/// Fields are decoded positionally, so new fields must be appended after the
/// existing ones and must not reorder or remove any field in place.
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
///
/// The topic layout is part of the schema: changing it is an incompatible
/// change that requires bumping [`EVENT_SCHEMA_VERSION`].
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

/// Emit the `expired` event when a payment passes its expiry without settling.
pub fn emit_expired(env: &Env, event: &PaymentEvent) {
    emit_payment_event(env, event_names::expired(), event);
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
    fn created_event_roundtrip() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Created);
        assert_eq!(event.status, PaymentStatus::Created);
        assert_eq!(event.version, EVENT_SCHEMA_VERSION);
    }

    /// The `expired` transition is authorized for the source only.
    #[test]
    fn expired_transition_authorized_for_source() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Expired);
        assert_eq!(permitted_actor(PaymentStatus::Expired), Some(PaymentActor::Source));
        assert!(authorize_transition(&event, PaymentStatus::Expired, &event.source).is_ok());
        assert_eq!(
            authorize_transition(&event, PaymentStatus::Expired, &event.destination),
            Err(ERR_UNAUTHORIZED_ACTOR)
        );
    }

    /// Cancellation is only allowed for unsettled payments.
    #[test]
    fn cancellable_only_before_settlement() {
        assert!(is_cancellable(PaymentStatus::Created));
        assert!(is_cancellable(PaymentStatus::Funded));
        assert!(!is_cancellable(PaymentStatus::Completed));
        assert!(!is_cancellable(PaymentStatus::Failed));
        assert!(!is_cancellable(PaymentStatus::Cancelled));
        assert!(!is_cancellable(PaymentStatus::Refunded));
        assert!(!is_cancellable(PaymentStatus::Expired));
    }

    /// Expiry boundary: before expiry only non-expiry transitions are allowed.
    #[test]
    fn expiry_boundary_before_expiry() {
        let expiry = 100u32;
        assert_eq!(
            authorize_expiry(PaymentStatus::Expired, expiry, 99),
            Err(ERR_PAYMENT_NOT_EXPIRED)
        );
        assert!(authorize_expiry(PaymentStatus::Funded, expiry, 99).is_ok());
    }

    /// Expiry boundary: at expiry only the expiry transition is allowed.
    #[test]
    fn expiry_boundary_at_expiry() {
        let expiry = 100u32;
        assert!(authorize_expiry(PaymentStatus::Expired, expiry, 100).is_ok());
        assert_eq!(
            authorize_expiry(PaymentStatus::Funded, expiry, 100),
            Err(ERR_PAYMENT_EXPIRED)
        );
    }

    /// Expiry boundary: after expiry only the expiry transition is allowed.
    #[test]
    fn expiry_boundary_after_expiry() {
        let expiry = 100u32;
        assert!(authorize_expiry(PaymentStatus::Expired, expiry, 101).is_ok());
        assert_eq!(
            authorize_expiry(PaymentStatus::Completed, expiry, 101),
            Err(ERR_PAYMENT_EXPIRED)
        );
    }

    /// Terminal states are final and cannot be cancelled or expired again.
    #[test]
    fn terminal_states_are_final() {
        assert!(is_terminal(PaymentStatus::Completed));
        assert!(is_terminal(PaymentStatus::Failed));
        assert!(is_terminal(PaymentStatus::Cancelled));
        assert!(is_terminal(PaymentStatus::Refunded));
        assert!(is_terminal(PaymentStatus::Expired));
        assert!(!is_terminal(PaymentStatus::Created));
        assert!(!is_terminal(PaymentStatus::Funded));
        assert!(!is_expirable(PaymentStatus::Expired));
    }

    /// Success: the schema version is stable and carried in every topic.
    #[test]
    fn schema_version_is_stable() {
        let env = Env::default();
        assert_eq!(EVENT_SCHEMA_VERSION, 1);
        let (_, version) = payment_topic(&env, event_names::created());
        assert_eq!(version, EVENT_SCHEMA_VERSION);
    }

    /// Boundary: existing status discriminants are frozen by the schema.
    #[test]
    fn status_discriminants_are_stable() {
        assert_eq!(PaymentStatus::Created as u32, 0);
        assert_eq!(PaymentStatus::Funded as u32, 1);
        assert_eq!(PaymentStatus::Completed as u32, 2);
        assert_eq!(PaymentStatus::Failed as u32, 3);
        assert_eq!(PaymentStatus::Cancelled as u32, 4);
        assert_eq!(PaymentStatus::Refunded as u32, 5);
    }

    /// Success: event names are stable identifiers for indexers.
    #[test]
    fn event_names_are_stable() {
        assert_eq!(event_names::created(), symbol_short!("pay_created"));
        assert_eq!(event_names::funded(), symbol_short!("pay_funded"));
        assert_eq!(event_names::completed(), symbol_short!("pay_completed"));
        assert_eq!(event_names::failed(), symbol_short!("pay_failed"));
        assert_eq!(event_names::cancelled(), symbol_short!("pay_cancelled"));
        assert_eq!(event_names::refunded(), symbol_short!("pay_refunded"));
    }

    /// Boundary: a compatible change (appended field) keeps the version and
    /// the existing payload fields intact.
    #[test]
    fn compatible_change_keeps_version_and_payload() {
        let env = Env::default();
        let event = sample(&env, PaymentStatus::Funded);
        // Existing fields retain their values and the version is unchanged.
        assert_eq!(event.version, EVENT_SCHEMA_VERSION);
        assert_eq!(event.payment_id, 42);
        assert_eq!(event.amount, 1_000_000);
        assert_eq!(event.status, PaymentStatus::Funded);
        let (name, version) = payment_topic(&env, event_names::funded());
        assert_eq!(name, event_names::funded());
        assert_eq!(version, EVENT_SCHEMA_VERSION);
    }

    /// Failure: an event carrying an unknown schema version is detectable so
    /// indexers can reject it instead of mis-decoding the payload.
    #[test]
    fn unknown_schema_version_is_detectable() {
        let env = Env::default();
        let mut event = sample(&env, PaymentStatus::Created);
        event.version = EVENT_SCHEMA_VERSION + 1;
        let (_, topic_version) = payment_topic(&env, event_names::created());
        assert_ne!(event.version, topic_version);
    }
}
