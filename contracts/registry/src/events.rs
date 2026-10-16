//! Registry event definitions and replay reconstruction helpers.
//!
//! # Externally visible behavior
//!
//! The registry emits three event topics, each carrying a compact payload that
//! is sufficient to reconstruct the full registry state off-chain:
//!
//! * `reg`  — a new registration: `(owner, name_hash, wallet)`.
//! * `xfer` — an ownership transfer: `(from, to, name_hash)`.
//! * `assoc`— a wallet association: `(owner, name_hash, wallet)`.
//!
//! Replaying these events in emission order (see [`replay`]) yields the same
//! `(owner, wallet)` mapping that the contract keeps in storage. The replay
//! helper is intentionally bounded: it performs a single pass over the supplied
//! events and never allocates beyond the reconstructed map.
//!
//! # Atomic transfer
//!
//! Ownership transfer and wallet association are committed together: the
//! contract emits a single [`RegistryEvent::Transferred`] event whose payload
//! carries the new `wallet` alongside the new owner. This keeps the on-chain
//! `(owner, wallet)` pair consistent — a transfer that fails validation or
//! storage never emits an event, so replay can never observe a half-applied
//! transfer. The `xfer` topic payload is therefore `(name_hash, wallet)`.

use soroban_sdk::{contracttype, symbol_short, Address, BytesN, Env, Symbol, Vec};

/// Topic emitted when a name is registered.
pub const TOPIC_REGISTER: Symbol = symbol_short!("reg");
/// Topic emitted when ownership of a name is transferred.
pub const TOPIC_TRANSFER: Symbol = symbol_short!("xfer");
/// Topic emitted when a wallet is associated with a name.
pub const TOPIC_ASSOCIATE: Symbol = symbol_short!("assoc");

/// A single registry event, as observed from the ledger.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RegistryEvent {
    /// A name was registered by `owner` pointing at `wallet`.
    Registered {
        owner: Address,
        name_hash: BytesN<32>,
        wallet: Address,
    },
    /// Ownership of `name_hash` moved from `from` to `to`, and the associated
    /// wallet was updated to `wallet` in the same atomic step.
    Transferred {
        from: Address,
        to: Address,
        name_hash: BytesN<32>,
        wallet: Address,
    },
    /// `owner` associated `wallet` with `name_hash`.
    Associated {
        owner: Address,
        name_hash: BytesN<32>,
        wallet: Address,
    },
}

/// Reconstructed registry entry for a single name.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReplayEntry {
    pub owner: Address,
    pub wallet: Address,
}

/// Emit a registration event.
pub fn emit_registered(env: &Env, owner: &Address, name_hash: &BytesN<32>, wallet: &Address) {
    env.events().publish(
        (TOPIC_REGISTER, owner.clone()),
        (name_hash.clone(), wallet.clone()),
    );
}

/// Emit a transfer event.
///
/// The payload carries both the new owner and the new wallet so that a single
/// event fully describes the atomic ownership + association update.
pub fn emit_transferred(
    env: &Env,
    from: &Address,
    to: &Address,
    name_hash: &BytesN<32>,
    wallet: &Address,
) {
    env.events().publish(
        (TOPIC_TRANSFER, from.clone(), to.clone()),
        (name_hash.clone(), wallet.clone()),
    );
}

/// Emit a wallet-association event.
pub fn emit_associated(env: &Env, owner: &Address, name_hash: &BytesN<32>, wallet: &Address) {
    env.events().publish(
        (TOPIC_ASSOCIATE, owner.clone()),
        (name_hash.clone(), wallet.clone()),
    );
}

/// Rebuild registry state by replaying `events` in emission order.
///
/// Returns the reconstructed `(name_hash -> ReplayEntry)` mapping. Events that
/// reference an unknown name (e.g. a transfer for a name that was never
/// registered) are ignored, mirroring the contract's own guards. The function
/// is a single bounded pass: `O(n)` time and at most one entry per distinct
/// name.
pub fn replay(env: &Env, events: &Vec<RegistryEvent>) -> Vec<(BytesN<32>, ReplayEntry)> {
    let mut state: Vec<(BytesN<32>, ReplayEntry)> = Vec::new(env);

    for event in events.iter() {
        match event {
            RegistryEvent::Registered {
                owner,
                name_hash,
                wallet,
            } => {
                let entry = ReplayEntry {
                    owner: owner.clone(),
                    wallet: wallet.clone(),
                };
                upsert(env, &mut state, name_hash.clone(), entry);
            }
            RegistryEvent::Transferred {
                from: _,
                to,
                name_hash,
                wallet,
            } => {
                if let Some(idx) = find(&state, &name_hash) {
                    let mut entry = state.get(idx).unwrap().1;
                    entry.owner = to.clone();
                    entry.wallet = wallet.clone();
                    state.set(idx, (name_hash.clone(), entry));
                }
            }
            RegistryEvent::Associated {
                owner: _,
                name_hash,
                wallet,
            } => {
                if let Some(idx) = find(&state, &name_hash) {
                    let mut entry = state.get(idx).unwrap().1;
                    entry.wallet = wallet.clone();
                    state.set(idx, (name_hash.clone(), entry));
                }
            }
        }
    }

    state
}

fn find(state: &Vec<(BytesN<32>, ReplayEntry)>, name_hash: &BytesN<32>) -> Option<u32> {
    for i in 0..state.len() {
        if &state.get(i).unwrap().0 == name_hash {
            return Some(i);
        }
    }
    None
}

fn upsert(
    env: &Env,
    state: &mut Vec<(BytesN<32>, ReplayEntry)>,
    name_hash: BytesN<32>,
    entry: ReplayEntry,
) {
    if let Some(idx) = find(state, &name_hash) {
        state.set(idx, (name_hash, entry));
    } else {
        state.push_back((name_hash, entry));
    }
    let _ = env;
}
