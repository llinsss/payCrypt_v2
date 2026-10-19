#![no_std]

//! # Escrow Contract
//!
//! A minimal single-escrow Soroban contract that holds funds for a
//! `creator`/`beneficiary` pair until they are released or the escrow is
//! cancelled.
//!
//! ## Deployment & initialization
//!
//! The contract has no constructor: deploying the WASM and invoking `create`
//! is the initialization step. `create` takes the escrow `id` (a `u32` chosen
//! by the caller and used as the storage key), the `creator`, `beneficiary`,
//! and `token` addresses, and a strictly positive `amount` (`i128`). The
//! `creator` must authorize the call (`creator.require_auth()`). A second
//! `create` for the same `id` fails with [`Error::AlreadyInitialized`].
//!
//! ## State machine
//!
//! ```text
//!            create                fund
//!   (none) ---------> Created -----------> Funded
//!                       |                    |
//!                  cancel|                    | (release)
//!                       v                    v
//!                   Cancelled            Released
//! ```
//!
//! * `Created` -> `Funded` via [`EscrowContract::fund`].
//! * `Created` -> `Cancelled` via [`EscrowContract::cancel`].
//! * `Funded` -> `Released` (release path).
//! * `Cancelled` and `Released` are terminal; any further operation on a
//!   cancelled escrow fails with [`Error::AlreadyCancelled`].
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
//! ## Authorization
//!
//! * `create` - requires `creator` auth.
//! * `cancel` - requires `creator` auth; only valid in `Created`.
//! * `fund` - requires `funder` auth.
//! * `release` - requires `creator` auth; only valid in `Funded`.
//! * `extend_deadline` - requires `creator` auth; only valid in `Funded`.
//! * `get` - read-only, no auth.
//!
//! ## Events
//!
//! Every lifecycle event is published with topics `(name, EVENT_VERSION)` and
//! data `(id, amount)`. Names are `created`, `funded`, `released`, and `refund`
//! (emitted on cancellation). For `released`, `amount` is the amount released
//! in that call (not the cumulative total). Consumers should key off
//! `EVENT_VERSION` to decode payloads.

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, String, Symbol};

/// Maximum byte length of escrow metadata accepted by [`EscrowContract::create`].
///
/// Metadata is stored in instance storage, so its size is bounded to keep
/// storage growth and per-invocation work predictable. Values longer than this
/// (in bytes) are rejected with [`Error::MetadataTooLong`] before any storage
/// write occurs.
pub const MAX_METADATA_LEN: u32 = 128;

/// Number of ledgers by which persistent escrow entries are extended on every
/// state-changing call. Renewal is bounded (a single `extend_ttl` per call) so
/// per-invocation work stays constant regardless of escrow count.
pub const ESCROW_TTL_THRESHOLD: u32 = 100;
pub const ESCROW_TTL_EXTEND_TO: u32 = 1000;

/// Lifecycle states for an escrow.
///
/// `Created` is the documented pre-funding state. An escrow in this state has
/// not received any funds yet, so it can be cancelled by its creator.
/// `Released` and `Cancelled` are terminal: once reached, no further state
/// transitions are permitted and the escrowed balance is always zero.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EscrowState {
    Created,
    Funded,
    Released,
    Cancelled,
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
    pub token: Address,
    pub amount: i128,
    pub remaining: i128,
    pub state: EscrowState,
}

/// Maximum number of times a single escrow deadline may be extended.
pub const MAX_EXTENSIONS: u32 = 3;

/// Maximum duration (in seconds) of a single extension.
pub const MAX_EXTENSION_DURATION: u64 = 30 * 24 * 60 * 60;

/// Schema version emitted with every lifecycle event.
///
/// Consumers should key off this version to decode event payloads. Bump it
/// only when the event schema changes in a backwards-incompatible way.
pub const EVENT_VERSION: u32 = 1;

/// Errors returned by the escrow contract.
///
/// `AssetMismatch` (code 4) is returned when a deposit or payout is attempted
/// with an asset contract address that does not match the asset bound to the
/// escrow at creation time. No state is mutated in that case.
///
/// `MetadataTooLong` (code 6) is returned when the supplied metadata exceeds
/// [`MAX_METADATA_LEN`] bytes. `MetadataInvalidChar` (code 7) is returned when
/// the metadata contains a byte outside the supported character policy (see
/// [`is_supported_metadata`]). Neither case mutates state.
///
/// * `AlreadyInitialized` (1) - escrow already exists for this id.
/// * `NotFound` (2) - no escrow exists for this id.
/// * `InvalidAmount` (3) - amount must be strictly positive.
/// * `InvalidState` (4) - operation not allowed in the current state.
/// * `AlreadyCancelled` (5) - escrow was already cancelled (replay rejected).
/// * `ExtensionLimitReached` (6) - maximum extension count already reached.
/// * `InvalidExtension` (7) - extension duration is zero or exceeds the maximum.
/// * `DeadlineOverflow` (8) - computing the new deadline would overflow.
/// * `AmountExceedsRemaining` (9) - release amount exceeds the remaining balance.
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotFound = 2,
    InvalidAmount = 3,
    InvalidState = 4,
    AlreadyCancelled = 5,
    ExtensionLimitReached = 6,
    InvalidExtension = 7,
    DeadlineOverflow = 8,
    AmountExceedsRemaining = 9,
}

/// Supported character policy for escrow metadata: printable ASCII only
/// (bytes `0x20..=0x7E`). This keeps metadata human-readable and avoids
/// ambiguous or control characters in stored records.
fn is_supported_metadata(metadata: &String) -> bool {
    let len = metadata.len();
    let mut buf = [0u8; MAX_METADATA_LEN as usize];
    metadata.copy_into_slice(&mut buf[..len as usize]);
    buf[..len as usize]
        .iter()
        .all(|b| (0x20..=0x7E).contains(b))
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Escrow(u32),
}

/// Emit a schema-versioned lifecycle event.
///
/// Topics are `(event_name, version)` so consumers can filter by event name
/// and rely on a stable schema version. The escrow `id` and `amount` are
/// included in the data payload for every event.
fn emit_lifecycle(env: &Env, name: Symbol, id: u32, amount: i128) {
    env.events()
        .publish((name, EVENT_VERSION), (id, amount));
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create an escrow, binding the asset contract address for its lifetime.
    ///
    /// `metadata` must be at most [`MAX_METADATA_LEN`] bytes and contain only
    /// printable ASCII characters; otherwise `Error::MetadataTooLong` or
    /// `Error::MetadataInvalidChar` is returned and no state is written.
    pub fn create(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        asset: Address,
        amount: i128,
        metadata: String,
    ) -> Result<(), Error> {
        depositor.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if metadata.len() > MAX_METADATA_LEN {
            return Err(Error::MetadataTooLong);
        }
        if !is_supported_metadata(&metadata) {
            return Err(Error::MetadataInvalidChar);
        }
        if env.storage().instance().has(&DataKey::Escrow) {
            return Err(Error::AlreadyInitialized);
        }
        let escrow = Escrow {
            depositor,
            beneficiary,
            asset,
            amount,
            remaining: amount,
            released: false,
            metadata,
        };
        env.storage().instance().set(&DataKey::Escrow, &escrow);
        Ok(())
    }

    /// Deposit funds into the escrow.
    ///
    /// `asset` must equal the asset bound at creation, otherwise
    /// `Error::AssetMismatch`

/* … truncated 6358 chars — edit only what you need near the top … */
