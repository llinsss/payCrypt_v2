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

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// Error codes returned by the escrow contract.
///
    InvalidAmount = 5,
    AssetMismatch = 6,
    MetadataTooLong = 7,
    InvalidMetadata = 8,
    NotCreated = 9,
    ExtensionTooLong = 10,
    TooManyExtensions = 11,
    DeadlineOverflow = 12,
    NotExpired = 13,
    AlreadyCancelled = 14,
    ExtensionLimitReached = 15,
    InvalidExtension = 16,
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

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create an escrow and transfer the escrowed amount from the creator to
    /// this contract.
    ///
    /// Only the `creator` may call this. The `amount` must be strictly positive.
    /// The `deadline` is the ledger sequence number after which `expire` becomes
    /// available.
    ///
    /// The token transfer happens atomically inside this entrypoint, so the
    /// creator only authorises a single invocation.
    pub fn create(
        env: Env,
        creator: Address,
        beneficiary: Address,
        asset: Address,
        amount: i128,
        deadline: u32,
    ) -> Result<(), EscrowError> {
        creator.require_auth();

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        if env.storage().persistent().has(&DataKey::Escrow()) {
            return Err(EscrowError::NotInitialized);
        }

        // Transfer the escrowed amount from creator to this contract.
        let token_client = token::Client::new(&env, &asset);
        token_client.transfer(&creator, &env.current_contract_address(), &amount);

        let escrow = Escrow {
            creator,
            beneficiary,
            asset,
            amount,
            remaining: amount,
            released: false,
            metadata,
        };
        save_escrow(&env, &escrow);

        emit_lifecycle_event(
            &env,
            Symbol::new(&env, "created"),
            &escrow.creator,
            amount,
            EscrowState::Created,
        );
        Ok(())
    }

    /// Create an escrow with a metadata string.
    ///
    /// Like [`create`], but accepts a `metadata` string that is stored with the
    /// escrow record. Metadata must be at most [`MAX_METADATA_LEN`] bytes and
    /// contain only printable ASCII characters; otherwise [`MetadataTooLong`] or
    /// [`InvalidMetadata`] is returned and no state is written.
    pub fn create_with_metadata(
        env: Env,
        creator: Address,
        beneficiary: Address,
        asset: Address,
        amount: i128,
        deadline: u32,
        metadata: String,
    ) -> Result<(), EscrowError> {
        creator.require_auth();

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        if metadata.len() > MAX_METADATA_LEN {
            return Err(EscrowError::MetadataTooLong);
        }
        if !is_supported_metadata(&metadata) {
            return Err(EscrowError::InvalidMetadata);
        }
        if env.storage().persistent().has(&DataKey::Escrow()) {
            return Err(EscrowError::NotInitialized);
        }

        let token_client = token::Client::new(&env, &asset);
        token_client.transfer(&creator, &env.current_contract_address(), &amount);

        let escrow = Escrow {
            creator,
            beneficiary,
            asset,
            amount,
            state: EscrowState::Created,
            deadline,
            extension_count: 0,
            metadata,
        };
        save_escrow(&env, &escrow);

        emit_lifecycle_event(
            &env,
            Symbol::new(&env, "created"),
            &escrow.creator,
            amount,
            EscrowState::Created,
        );
        Ok(())
    }

    /// Deposit additional funds into the escrow.
    ///
    /// Only the `creator` may call this. The `asset` must match the asset bound
    /// at creation, otherwise [`AssetMismatch`] is returned and no state is
    /// mutated. The `amount` is transferred from the creator to this contract.
    /// This function does **not** alter the escrow state.
    pub fn deposit(
        env: Env,
        asset: Address,
        amount: i128,
    ) -> Result<(), EscrowError> {
        let escrow: Escrow = load_escrow(&env)
            .ok_or(EscrowError::NotInitialized)?;
        escrow.creator.require_auth();

        if asset != escrow.asset {
            return Err(EscrowError::AssetMismatch);
        }
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let client = token::Client::new(&env, &escrow.asset);
        client.transfer(&escrow.creator, &env.current_contract_address(), &amount);

        Ok(())
    }

    /// Release funds to the beneficiary.
    ///
    /// Only the `creator` may call this. The `asset` must match the asset bound
    /// at creation. The escrow must be in [`Created`] state.
    ///
    /// Reentrancy safety: the state is updated to [`Released`] **before** the
    /// external token transfer is invoked. If the token contract re-enters this
    /// contract during the callback, the escrow is already marked `Released` and
    /// the re-entrant call fails.
    pub fn release(
        env: Env,
        asset: Address,
    ) -> Result<(), EscrowError> {
        let escrow: Escrow = load_escrow(&env)
            .ok_or(EscrowError::NotInitialized)?;
        escrow.creator.require_auth();

        if asset != escrow.asset {
            return Err(EscrowError::AssetMismatch);
        }
        if escrow.state != EscrowState::Created {
            return Err(EscrowError::NotCreated);
        }

        // Finalize the state before the external call so a re-entrant callback
        // observes `Released` and cannot double-spend.
        let mut updated = escrow.clone();
        updated.state = EscrowState::Released;
        save_escrow(&env, &updated);

        let client = token::Client::new(&env, &escrow.asset);
        client.transfer(
            &env.current_contract_address(),
            &escrow.beneficiary,
            &escrow.amount,
        );

        emit_lifecycle_event(
            &env,
            Symbol::new(&env, "released"),
            &escrow.beneficiary,
            escrow.amount,
            EscrowState::Released,
        );
        Ok(())
    }

    /// Cancel the escrow and return the funds to the creator.
    ///
    /// Only the `creator` may call this. The escrow must be in [`Created`]
    /// state. On success the escrow transitions to [`Cancelled`] (terminal) and
    /// the escrowed tokens are transferred back to the creator.
    pub fn cancel(
        env: Env,
    ) -> Result<(), EscrowError> {
        let escrow: Escrow = load_escrow(&env)
            .ok_or(EscrowError::NotInitialized)?;
        escrow.creator.require_auth();

        if escrow.state != EscrowState::Created {
            return Err(EscrowError::NotCreated);
        }

        let mut updated = escrow.clone();
        updated.state = EscrowState::Cancelled;
        save_escrow(&env, &updated);

        let client = token::Client::new(&env, &escrow.asset);
        client.transfer(
            &env.current_contract_address(),
            &escrow.creator,
            &escrow.amount,
        );

        emit_lifecycle_event(
            &env,
            Symbol::new(&env, "refunded"),
            &escrow.creator,
            escrow.amount,
            EscrowState::Cancelled,
        );
        Ok(())
    }

    /// Expire the escrow after its deadline has passed and return the funds to
    /// the creator.
    ///
    /// Anyone may call this. The escrow must be in [`Created`] state and the
    /// current ledger sequence must be at or past `deadline`. On success the
    /// escrow transitions to [`Expired`] (terminal) and the escrowed tokens are
    /// transferred back to the creator.
    pub fn expire(
        env: Env,
    ) -> Result<(), EscrowError> {
        let escrow: Escrow = load_escrow(&env)
            .ok_or(EscrowError::NotInitialized)?;

        if escrow.state != EscrowState::Created {
            return Err(EscrowError::NotCreated);
        }
        if env.ledger().sequence() < escrow.deadline {
            return Err(EscrowError::NotExpired);
        }

        let mut updated = escrow.clone();
        updated.state = EscrowState::Expired;
        save_escrow(&env, &updated);

        let client = token::Client::new(&env, &escrow.asset);
        client.transfer(
            &env.current_contract_address(),
            &escrow.creator,
            &escrow.amount,
        );

        emit_lifecycle_event(
            &env,
            Symbol::new(&env, "refunded"),
            &escrow.creator,
            escrow.amount,
            EscrowState::Expired,
        );
        Ok(())
    }

    /// Extend the escrow deadline by `extension` ledger sequences.
    ///
    /// Only the `creator` may call this. The escrow must be in [`Created`]
    /// state.
    ///
    /// Bounded by:
    /// - `extension` must be positive and at most [`MAX_EXTENSION_DURATION`];
    /// - the total number of extensions must be strictly below
    ///   [`MAX_EXTENSIONS`];
    /// - the new deadline must not overflow the `u32` type.
    ///
    /// Returns the new deadline on success.
    pub fn extend_deadline(
        env: Env,
        actor: Address,
        extension: u64,
    ) -> Result<u32, EscrowError> {
        let escrow: Escrow = load_escrow(&env)
            .ok_or(EscrowError::NotInitialized)?;
        actor.require_auth();
        if actor != escrow.creator {
            return Err(EscrowError::Unauthorized);
        }

        if escrow.state != EscrowState::Created {
            return Err(EscrowError::NotCreated);
        }
        if extension > MAX_EXTENSION_DURATION || extension == 0 {
            return Err(EscrowError::ExtensionTooLong);
        }
        if escrow.extension_count >= MAX_EXTENSIONS {
            return Err(EscrowError::TooManyExtensions);
        }

        let new_deadline = escrow.deadline as u64 + extension;
        if new_deadline > 0xFFFF_FFFFu64 {
            return Err(EscrowError::DeadlineOverflow);
        }

        let mut updated = escrow.clone();
        updated.deadline = new_deadline as u32;
        updated.extension_count += 1;
        save_escrow(&env, &updated);

        Ok(updated.deadline)
    }

    /// Read the current escrow record.
    ///
    /// Fails with [`EscrowError::NotInitialized`] if no escrow exists.
    pub fn get(
        env: Env,
    ) -> Result<Escrow, EscrowError> {
        load_escrow(&env).ok_or(EscrowError::NotInitialized)
    }
}
