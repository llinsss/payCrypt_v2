#![no_std]

//! # Escrow Contract
//!
//! A Soroban escrow contract that holds funds between a creator (depositor) and a
//! beneficiary until the escrow is released, cancelled, or expired.
//!
//! ## State machine
//!
//! ```text
//!   (none) --create--> Created --release--> Released (terminal)
//!                           |
//!                       cancel|--- expire (after deadline)
//!                           |         |
//!                        Cancelled  Expired
//!                            (terminal)  (terminal)
//! ```
//!
//! - **Created**  — funds held in contract, waiting for release.
//! - **Released** — funds paid out to beneficiary. Terminal.
//! - **Cancelled**— funds returned to creator. Terminal.
//! - **Expired**  — deadline passed; funds returned to creator. Terminal.
//!
//! ## Partial release
//!
//! [`EscrowContract::release`] accepts an explicit `amount` and supports
//! partial releases. Each successful release transfers `amount` to the
//! beneficiary and decrements the escrow's remaining balance. The escrow only
//! transitions to `Released` once the remaining balance reaches zero; until
//! then it stays `Funded` and further releases are permitted. Release amounts
//! that are zero or negative fail with [`Error::InvalidAmount`], and amounts
//! greater than the remaining balance fail with [`Error::AmountExceedsRemaining`].
//! No state is mutated on a rejected release.
//!
//! ## Disputes
//!
//! A funded escrow may be moved into a `Disputed` state by the creator or the
//! beneficiary. While disputed, `release`, `cancel`, and `expire` are blocked.
//! The dispute is resolved by the designated arbiter (or, when no arbiter is
//! set, by the creator) via [`EscrowContract::resolve_dispute`], which either
//! releases the remaining balance to the beneficiary or refunds it to the
//! creator. Dispute records are stored under a versioned key so future schema
//! changes remain upgrade-compatible.
//!
//! ## Authorization
//!
//! * `create` - requires `creator` auth.
//! * `cancel` - requires `creator` auth; only valid in `Created`.
//! * `fund` - requires `funder` auth.
//! * `release` - requires `creator` auth; only valid in `Funded`.
//! * `extend_deadline` - requires `creator` auth; only valid in `Funded`.
//! * `open_dispute` - requires `creator` or `beneficiary` auth; only valid in `Funded`.
//! * `resolve_dispute` - requires arbiter (or creator) auth; only valid in `Disputed`.
//! * `get` - read-only, no auth.
//!
//! ## Events
//!
//! Every lifecycle event is published with topics `(name, EVENT_VERSION)` and
//! data `(id, amount)`. Names are `created`, `funded`, `released`, and `refund`
//! (emitted on cancellation). For `released`, `amount` is the amount released
//! in that call (not the cumulative total). Consumers should key off
//! `EVENT_VERSION` to decode payloads. Dispute lifecycle events are
//! `dispute_opened` and `dispute_resolved`.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, String, Symbol};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum byte length of escrow metadata. Metadata longer than this is
/// rejected with [`EscrowError::MetadataTooLong`] before any storage write.
pub const MAX_METADATA_LEN: u32 = 128;

/// Maximum number of times a single escrow deadline may be extended.
pub const MAX_EXTENSIONS: u32 = 3;

/// Maximum duration (in ledger seconds) of a single deadline extension.
pub const MAX_EXTENSION_DURATION: u64 = 30 * 24 * 60 * 60; // 30 days

/// Schema version emitted with every lifecycle event.
pub const EVENT_VERSION: u32 = 1;

/// Schema version for the dispute record. Bumped only on breaking changes so
/// existing dispute entries remain readable across upgrades.
pub const DISPUTE_SCHEMA_VERSION: u32 = 1;

/// TTL threshold (ledgers) below which a persistent entry is renewed on read.
pub const ESCROW_TTL_THRESHOLD: u32 = 100;

/// TTL extension (ledgers) applied on renewal.
pub const ESCROW_TTL_EXTEND_TO: u32 = 1000;

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

/// Deterministic storage keys for the escrow contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Single escrow record stored in persistent storage.
    Escrow(),
    /// Dispute record, keyed by schema version for upgrade compatibility.
    Dispute(u32),
}

// ---------------------------------------------------------------------------
// Escrow state and record types
// ---------------------------------------------------------------------------

/// Lifecycle states for an escrow.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowState {
    Created,
    Funded,
    Released,
    Cancelled,
    Expired,
    Disputed,
}

/// Persisted escrow record.
///
/// `remaining` tracks the balance still held by the escrow. It starts equal to
/// `amount` and is decremented by each partial release; the escrow transitions
/// to `Released` only when `remaining` reaches zero.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub creator: Address,
    pub beneficiary: Address,
    pub asset: Address,
    pub amount: i128,
    pub remaining: i128,
    pub state: EscrowState,
    pub deadline: u32,
    pub extension_count: u32,
    pub metadata: String,
}

/// Persisted dispute record.
///
/// `opened_by` records the party that opened the dispute (creator or
/// beneficiary). `arbiter` is the optional designated resolver; when `None`
/// the creator resolves. `resolved` guards against replay of resolution.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dispute {
    pub schema_version: u32,
    pub opened_by: Address,
    pub arbiter: Option<Address>,
    pub resolved: bool,
    pub release_to_beneficiary: bool,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Error codes returned by the escrow contract.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum EscrowError {
    NotInitialized = 1,
    Unauthorized = 2,
    EscrowNotFound = 3,
    InvalidState = 4,
    AlreadyCancelled = 5,
    ExtensionLimitReached = 6,
    InvalidExtension = 7,
    DeadlineOverflow = 8,
    AmountExceedsRemaining = 9,
    AlreadyInitialized = 10,
    DisputeAlreadyOpen = 11,
    DisputeNotOpen = 12,
    DisputeAlreadyResolved = 13,
    InvalidAmount = 14,
    AssetMismatch = 15,
    MetadataTooLong = 16,
    InvalidMetadata = 17,
    NotCreated = 18,
    ExtensionTooLong = 19,
    TooManyExtensions = 20,
    NotExpired = 21,
}

// ---------------------------------------------------------------------------
// Metadata character policy
// ---------------------------------------------------------------------------

/// Returns `true` when every byte in `metadata` is a printable ASCII character
/// (`0x20`–`0x7E`). Empty metadata is always accepted.
fn is_supported_metadata(metadata: &String) -> bool {
    let len = metadata.len();
    if len == 0 {
        return true;
    }
    let mut buf: [u8; 128] = [0u8; 128];
    metadata.copy_into_slice(&mut buf[..len as usize]);
    buf[..len as usize]
        .iter()
        .all(|b| (0x20..=0x7E).contains(b))
}

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

/// Emit a versioned lifecycle event.
///
/// Topics: `(EVENT_VERSION, event_name, actor_address)`.
/// Data:   `(amount, state)`.
fn emit_lifecycle_event(
    env: &Env,
    name: Symbol,
    actor: &Address,
    amount: i128,
    state: EscrowState,
) {
    env.events().publish(
        (EVENT_VERSION, name, actor.clone()),
        (amount, state),
    );
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/// Read the escrow record from persistent storage, renewing its TTL.
fn load_escrow(env: &Env) -> Option<Escrow> {
    let key = DataKey::Escrow();
    match env.storage().persistent().get(&key) {
        Some(escrow) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, ESCROW_TTL_THRESHOLD, ESCROW_TTL_EXTEND_TO);
            Some(escrow)
        }
        None => None,
    }
}

/// Persist the escrow record and (re)arm its TTL.
fn save_escrow(env: &Env, escrow: &Escrow) {
    let key = DataKey::Escrow();
    env.storage().persistent().set(&key, escrow);
    env.storage()
        .persistent()
        .extend_ttl(&key, ESCROW_TTL_THRESHOLD, ESCROW_TTL_EXTEND_TO);
}

/// Read the dispute record for the current schema version, renewing its TTL.
fn load_dispute(env: &Env) -> Option<Dispute> {
    let key = DataKey::Dispute(DISPUTE_SCHEMA_VERSION);
    match env.storage().persistent().get(&key) {
        Some(dispute) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, ESCROW_TTL_THRESHOLD, ESCROW_TTL_EXTEND_TO);
            Some(dispute)
        }
        None => None,
    }
}

/// Persist the dispute record and (re)arm its TTL.
fn save_dispute(env: &Env, dispute: &Dispute) {
    let key = DataKey::Dispute(DISPUTE_SCHEMA_VERSION);
    env.storage().persistent().set(&key, dispute);
    env.storage()
        .persistent()
        .extend_ttl(&key, ESCROW_TTL_THRESHOLD, ESCROW_TTL_EXTEND_TO);
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Open a dispute on a funded escrow.
    ///
    /// Only the creator or the beneficiary may open a dispute, and only while
    /// the escrow is `Funded`. Opening a dispute moves the escrow into the
    /// `Disputed` state and records the opener plus an optional arbiter.
    /// Re-opening an already-disputed escrow fails with
    /// [`EscrowError::DisputeAlreadyOpen`].
    pub fn open_dispute(
        env: Env,
        opener: Address,
        arbiter: Option<Address>,
    ) -> Result<(), EscrowError> {
        opener.require_auth();

        let mut escrow = load_escrow(&env).ok_or(EscrowError::EscrowNotFound)?;

        if opener != escrow.creator && opener != escrow.beneficiary {
            return Err(EscrowError::Unauthorized);
        }
        if escrow.state == EscrowState::Disputed {
            return Err(EscrowError::DisputeAlreadyOpen);
        }
        if escrow.state != EscrowState::Funded {
            return Err(EscrowError::InvalidState);
        }

        let dispute = Dispute {
            schema_version: DISPUTE_SCHEMA_VERSION,
            opened_by: opener.clone(),
            arbiter,
            resolved: false,
            release_to_beneficiary: false,
        };
        save_dispute(&env, &dispute);

        escrow.state = EscrowState::Disputed;
        save_escrow(&env, &escrow);

        emit_lifecycle_event(
            &env,
            Symbol::new(&env, "dispute_opened"),
            &opener,
            escrow.remaining,
            EscrowState::Disputed,
        );
        Ok(())
    }

    /// Resolve an open dispute.
    ///
    /// Only the designated arbiter (or the creator when no arbiter was set)
    /// may resolve. `release_to_beneficiary` selects whether the remaining
    /// balance is paid to the beneficiary (`true`) or refunded to the creator
    /// (`false`). Resolving an already-resolved dispute fails with
    /// [`EscrowError::DisputeAlreadyResolved`] (replay protection).
    pub fn resolve_dispute(
        env: Env,
        resolver: Address,
        release_to_beneficiary: bool,
    ) -> Result<(), EscrowError> {
        resolver.require_auth();

        let mut escrow = load_escrow(&env).ok_or(EscrowError::EscrowNotFound)?;
        let mut dispute = load_dispute(&env).ok_or(EscrowError::DisputeNotOpen)?;

        if escrow.state != EscrowState::Disputed {
            return Err(EscrowError::DisputeNotOpen);
        }
        if dispute.resolved {
            return Err(EscrowError::DisputeAlreadyResolved);
        }

        let authorized = match &dispute.arbiter {
            Some(arbiter) => resolver == *arbiter,
            None => resolver == escrow.creator,
        };
        if !authorized {
            return Err(EscrowError::Unauthorized);
        }

        let token_client = token::Client::new(&env, &escrow.asset);
        let payout = escrow.remaining;
        if release_to_beneficiary {
            token_client.transfer(&env.current_contract_address(), &escrow.beneficiary, &payout);
            escrow.remaining = 0;
            escrow.state = EscrowState::Released;
        } else {
            token_client.transfer(&env.current_contract_address(), &escrow.creator, &payout);
            escrow.remaining = 0;
            escrow.state = EscrowState::Cancelled;
        }

        dispute.resolved = true;
        dispute.release_to_beneficiary = release_to_beneficiary;
        save_dispute(&env, &dispute);
        save_escrow(&env, &escrow);

        emit_lifecycle_event(
            &env,
            Symbol::new(&env, "dispute_resolved"),
            &resolver,
            payout,
            escrow.state,
        );
        Ok(())
    }

    /// Read the current dispute record, if any.
    pub fn get_dispute(env: Env) -> Option<Dispute> {
        load_dispute(&env)
    }
}
