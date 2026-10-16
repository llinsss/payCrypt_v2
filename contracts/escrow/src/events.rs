//! Versioned escrow lifecycle events.
//!
//! Every externally visible state transition emits a stable, schema-versioned
//! event so off-chain consumers can index escrow activity without tracking
//! contract internals. The schema version is carried in the first topic
//! (`"escrow_v1"`) and the lifecycle stage in the second topic, followed by the
//! indexed escrow id. Amounts are emitted as `i128` data payloads.
//!
//! Topics layout (stable for schema `v1`):
//!   topic[0] = "escrow_v1"   (schema version tag)
//!   topic[1] = stage         ("created" | "funded" | "released" | "refunded" | "disputed" | "resolved")
//!   topic[2] = escrow_id     (indexed id)
//!
//! Data payloads:
//!   created   -> (amount: i128)
//!   funded    -> (amount: i128)
//!   released  -> (amount: i128)
//!   refunded  -> (amount: i128)
//!   disputed  -> (amount: i128)
//!   resolved  -> (amount: i128)

use soroban_sdk::{symbol_short, Env, Symbol};

/// Schema version tag emitted as the first topic of every lifecycle event.
pub const EVENT_SCHEMA_VERSION: Symbol = symbol_short!("escrow_v1");

/// Lifecycle stages emitted by the escrow contract.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowEvent {
    Created,
    Funded,
    Released,
    Refunded,
    Disputed,
    Resolved,
}

impl EscrowEvent {
    /// Stable stage symbol used as the second event topic.
    pub fn stage(&self) -> Symbol {
        match self {
            EscrowEvent::Created => symbol_short!("created"),
            EscrowEvent::Funded => symbol_short!("funded"),
            EscrowEvent::Released => symbol_short!("released"),
            EscrowEvent::Refunded => symbol_short!("refunded"),
            EscrowEvent::Disputed => symbol_short!("disputed"),
            EscrowEvent::Resolved => symbol_short!("resolved"),
        }
    }
}

/// Emit a versioned lifecycle event for `escrow_id` carrying `amount`.
///
/// The schema version tag is always the first topic so consumers can filter on
/// a stable schema, and the escrow id is indexed for efficient lookups.
pub fn emit_lifecycle(env: &Env, stage: EscrowEvent, escrow_id: u64, amount: i128) {
    let topics = (
        EVENT_SCHEMA_VERSION,
        stage.stage(),
        escrow_id,
    );
    env.events().publish(topics, amount);
}

/// Emit the escrow creation event.
pub fn emit_created(env: &Env, escrow_id: u64, amount: i128) {
    emit_lifecycle(env, EscrowEvent::Created, escrow_id, amount);
}

/// Emit the escrow funding event.
pub fn emit_funded(env: &Env, escrow_id: u64, amount: i128) {
    emit_lifecycle(env, EscrowEvent::Funded, escrow_id, amount);
}

/// Emit the escrow release event.
pub fn emit_released(env: &Env, escrow_id: u64, amount: i128) {
    emit_lifecycle(env, EscrowEvent::Released, escrow_id, amount);
}

/// Emit the escrow refund event.
pub fn emit_refunded(env: &Env, escrow_id: u64, amount: i128) {
    emit_lifecycle(env, EscrowEvent::Refunded, escrow_id, amount);
}

/// Emit the escrow dispute event.
pub fn emit_disputed(env: &Env, escrow_id: u64, amount: i128) {
    emit_lifecycle(env, EscrowEvent::Disputed, escrow_id, amount);
}

/// Emit the escrow resolution event.
pub fn emit_resolved(env: &Env, escrow_id: u64, amount: i128) {
    emit_lifecycle(env, EscrowEvent::Resolved, escrow_id, amount);
}
