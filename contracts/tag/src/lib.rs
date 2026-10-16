#![no_std]

//! Soroban tag registry with canonical tag normalization.
//!
//! # Tag normalization
//!
//! Every entry point that accepts a user-supplied tag routes it through
//! [`normalize::TagName`] first. Normalization is defined in
//! [`normalize`] and is the contract's only accepted canonicalization: ASCII
//! only, at most one leading `@`, ASCII-lowercased, trimmed, restricted to
//! `[a-z0-9_]`, and bounded to [`normalize::MAX_TAG_BYTES`] bytes.
//!
//! Two consequences matter for callers and indexers:
//!
//! * **The contract cannot abort on a tag.** `Symbol::new` panics above 32
//!   characters, so an unvalidated tag would be a failed transaction. Every
//!   accepted tag is at most that long by construction.
//! * **One tag, one stored value.** `"Ada"`, `"@Ada"` and `"  ADA  "` all
//!   resolve to the same stored symbol, so tag identity cannot be split by
//!   cosmetic differences.
//!
//! [`TagContract::inspect_tag`] exposes the same normalization as a read-only
//! view so clients and indexers can reproduce a decision without simulating a
//! transaction, and so rejection reasons can be counted by the stable
//! [`normalize::TagNameError::code`].
//!
//! # Expiry and renewal
//!
//! A tag carries an optional `expires_at` ledger timestamp. Expiry is
//! evaluated against the *current ledger timestamp* (`env.ledger().timestamp()`),
//! never wall-clock time, so replaying a ledger produces the same answer.
//! A tag is expired when `expires_at <= now`; the boundary is inclusive, so a
//! tag is live for exactly `expires_at - registered_at` seconds.
//!
//! Only the current owner may [`TagContract::renew_tag`], which sets
//! `expires_at = now + duration`. Renewal is allowed while the tag is live or
//! expired, but not while a transfer is pending, so ownership cannot change
//! underneath a renewal. Expiry never deletes the tag or detaches wallets:
//! the owner and name are preserved, and [`TagContract::is_expired`] reports
//! the state. Expired tags reject new wallet associations via
//! [`TagContract::associate_wallet`] with [`TagError::TagExpired`].
//!
//! # Determinism
//!
//! Normalization reads no ledger state, so a historical replay and a live
//! query produce the same answer for the same input. Ledger-dependent
//! behaviour is confined to the ownership transfer flow and to expiry, whose
//! state machine and authorization rules are unchanged by normalization.

// The `std` and `alloc` preludes are deliberately absent from the contract
// build. The harness, fixtures, and tests need them, so they are linked only
// when those modules are compiled.
#[cfg(any(test, feature = "fuzz-harness"))]
extern crate alloc;

#[cfg(test)]
extern crate std;

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, String, Symbol,
};

pub mod normalize;

#[cfg(any(test, feature = "fuzz-harness"))]
pub mod fixtures;

#[cfg(any(test, feature = "fuzz-harness"))]
pub mod harness;

#[cfg(any(test, feature = "fuzz-harness"))]
pub mod symbol_check;

#[cfg(test)]
mod contract_tests;

#[cfg(test)]
mod confusable_tests;

#[cfg(test)]
mod security_invariants_tests;

pub use normalize::{TagName, TagNameError, MAX_RAW_SCAN_BYTES, MAX_TAG_BYTES, MIN_TAG_BYTES};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TagError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    NoPendingTransfer = 4,
    /// The supplied tag failed normalization. The specific reason is available
    /// from [`TagContract::inspect_tag`] and from
    /// [`normalize::TagNameError::code`].
    InvalidTagName = 5,
    /// The tag has expired at the current ledger timestamp. New wallet
    /// associations are rejected; existing state is preserved.
    TagExpired = 6,
    /// A renewal was attempted while an ownership transfer is pending.
    TransferPending = 7,
    /// The requested renewal duration is zero or negative.
    InvalidDuration = 8,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tag {
    pub owner: Address,
    pub name: Symbol,
    /// Ledger timestamp at which the tag expires, or `None` for a tag that
    /// never expires. Expiry is inclusive: the tag is expired when
    /// `expires_at <= env.ledger().timestamp()`.
    pub expires_at: Option<u64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingTransfer {
    pub from: Address,
    pub to: Address,
}

/// Result of normalizing a candidate tag, as returned by
/// [`TagContract::inspect_tag`].
///
/// This type never appears in a contract result, only in a success value, so
/// `accepted == false` is reported as data rather than as a failed
/// transaction. That keeps a rejected tag observable to indexers and
/// monitoring, which cannot see a reverted call.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TagInspection {
    /// Whether the candidate normalized successfully.
    pub accepted: bool,
    /// [`normalize::TagNameError::code`] when rejected, `0` when accepted.
    pub code: u32,
    /// Canonical tag when accepted, an empty symbol when rejected.
    pub canonical: Symbol,
    /// Canonical length in bytes when accepted, `0` when rejected.
    pub byte_len: u32,
}

/// Storage key for the registered tag.
const TAG_KEY: &str = "tag";
/// Storage key for the pending ownership transfer.
const PENDING_KEY: &str = "pending";

#[contract]
pub struct TagContract;

#[contractimpl]
impl TagContract {
    /// Initialize the registry from an already-canonical tag.
    ///
    /// Retained for clients that canonicalize before submitting. Prefer
    /// [`TagContract::initialize_tag`], which normalizes on-chain so the
    /// canonical form is not trusted from the caller. The tag never expires.
    pub fn initialize(env: Env, owner: Address, name: Symbol) -> Result<(), TagError> {
        Self::store_tag(&env, owner, name, None)
    }

    /// Initialize the registry from a raw, unnormalized tag.
    ///
    /// Applies [`normalize::TagName`] and stores the canonical symbol, so
    /// `"@Ada"`, `"  ADA  "` and `"Ada"` all register the same tag. Returns
    /// [`TagError::InvalidTagName`] if the tag cannot be normalized. The tag
    /// never expires.
    pub fn initialize_tag(env: Env, owner: Address, tag: String) -> Result<(), TagError> {
        let canonical = Self::canonicalize(&env, &tag)?;
        Self::store_tag(&env, owner, canonical, None)
    }

    /// Initialize the registry from a raw tag with an explicit expiry.
    ///
    /// `duration` is the number of seconds from the current ledger timestamp
    /// at which the tag expires. A `duration` of `0` registers a tag that
    /// never expires. Returns [`TagError::InvalidDuration`] for a negative
    /// duration and [`TagError::InvalidTagName`] if the tag cannot be
    /// normalized.
    pub fn initialize_tag_with_expiry(
        env: Env,
        owner: Address,
        tag: String,
        duration: i64,
    ) -> Result<(), TagError> {
        let canonical = Self::canonicalize(&env, &tag)?;
        let expires_at = Self::expiry_from_duration(&env, duration)?;
        Self::store_tag(&env, owner, canonical, expires_at)
    }

    /// Normalize a candidate tag without touching storage.
    ///
    /// Never fails, so a caller can compare its own normalization against the
    /// contract's before submitting a transaction.
    pub fn inspect_tag(env: Env, tag: String) -> TagInspection {
        match Self::normalize(&tag) {
            Ok(canonical) => TagInspection {
                accepted: true,
                code: 0,
                byte_len: canonical.byte_len() as u32,
                canonical: Symbol::new(&env, canonical.as_str()),
            },
            Err(error) => TagInspection {
                accepted: false,
                code: error.code(),
                byte_len: 0,
                canonical: Symbol::new(&env, ""),
            },
        }
    }

    /// Canonical length in bytes of a candidate tag, or `0` if it is rejected.
    ///
    /// A convenience view over [`TagContract::inspect_tag`] for clients that
    /// only need to know whether a tag fits.
    pub fn tag_byte_len(env: Env, tag: String) -> u32 {
        Self::inspect_tag(env, tag).byte_len
    }

    pub fn get_tag(env: Env) -> Result<Tag, TagError> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, TAG_KEY))
            .ok_or(TagError::NotInitialized)
    }

    /// Whether the registered tag is expired at the current ledger timestamp.
    ///
    /// Returns `false` for a tag that never expires. The boundary is
    /// inclusive: a tag with `expires_at == now` is expired.
    pub fn is_expired(env: Env) -> Result<bool, TagError> {
        let tag: Tag = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, TAG_KEY))
            .ok_or(TagError::NotInitialized)?;
        Ok(Self::tag_expired(&env, &tag))
    }

    /// Renew the registered tag, extending its expiry by `duration` seconds
    /// from the current ledger timestamp.
    ///
    /// Only the current owner may renew. Renewal is permitted while the tag is
    /// live or already expired, but not while an ownership transfer is
    /// pending, so the owner cannot change underneath a renewal. A `duration`
    /// of `0` clears the expiry, making the tag permanent. Returns
    /// [`TagError::InvalidDuration`] for a negative duration and
    /// [`TagError::TransferPending`] when a transfer is pending.
    pub fn renew_tag(env: Env, duration: i64) -> Result<u64, TagError> {
        let mut tag: Tag = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, TAG_KEY))
            .ok_or(TagError::NotInitialized)?;
        tag.owner.require_auth();

        if env
            .storage()
            .instance()
            .has(&Symbol::new(&env, PENDING_KEY))
        {
            return Err(TagError::TransferPending);
        }

        let expires_at = Self::expiry_from_duration(&env, duration)?;
        tag.expires_at = expires_at;
        env.storage()
            .instance()
            .set(&Symbol::new(&env, TAG_KEY), &tag);

        let new_expiry = expires_at.unwrap_or(0);
        Self::publish_renewal_event(&env, &tag.owner, new_expiry);
        Ok(new_expiry)
    }

    /// Associate a wallet with the registered tag.
    ///
    /// Rejected with [`TagError::TagExpired`] when the tag is expired at the
    /// current ledger timestamp, so an expired tag cannot accrue new
    /// associations. Existing associations are preserved by expiry.
    pub fn associate_wallet(env: Env, wallet: Address) -> Result<(), TagError> {
        let tag: Tag = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, TAG_KEY))
            .ok_or(TagError::NotInitialized)?;
        if Self::tag_expired(&env, &tag) {
            return Err(TagError::TagExpired);
        }
        wallet.require_auth();
        Self::publish_wallet_event(&env, "wallet_associated", &tag.owner, &wallet);
        Ok(())
    }

    pub fn get_pending_transfer(env: Env) -> Option<PendingTransfer> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, PENDING_KEY))
    }

    /// Propose a two-step ownership transfer. The current owner remains
    /// authoritative until the pending owner accepts. A new proposal replaces
    /// any existing pending transfer.
    pub fn propose_transfer(env: Env, to: Address) -> Result<(), TagError> {
        let tag: Tag = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, TAG_KEY))
            .ok_or(TagError::NotInitialized)?;
        tag.owner.require_auth();

        let pending = PendingTransfer {
            from: tag.owner.clone(),
            to: to.clone(),
        };
        env.storage()
            .instance()
            .set(&Symbol::new(&env, PENDING_KEY), &pending);

        Self::publish_transfer_event(&env, "transfer_pending", &tag.owner, &to);
        Ok(())
    }

    /// Cancel a pending transfer. Only the current owner may cancel.
    pub fn cancel_transfer(env: Env) -> Result<(), TagError> {
        let tag: Tag = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, TAG_KEY))
            .ok_or(TagError::NotInitialized)?;
        tag.owner.require_auth();

        let pending: PendingTransfer = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, PENDING_KEY))
            .ok_or(TagError::NoPendingTransfer)?;

        env.storage()
            .instance()
            .remove(&Symbol::new(&env, PENDING_KEY));

        Self::publish_transfer_event(&env, "transfer_cancelled", &pending.from, &pending.to);
        Ok(())
    }

    /// Accept a pending transfer. Only the pending destination may accept.
    /// The expiry is preserved across the ownership change.
    pub fn accept_transfer(env: Env) -> Result<(), TagError> {
        let mut tag: Tag = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, TAG_KEY))
            .ok_or(TagError::NotInitialized)?;

        let pending: PendingTransfer = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, PENDING_KEY))
            .ok_or(TagError::NoPendingTransfer)?;
        pending.to.require_auth();

        tag.owner = pending.to.clone();
        env.storage()
            .instance()
            .set(&Symbol::new(&env, TAG_KEY), &tag);
        env.storage()
            .instance()
            .remove(&Symbol::new(&env, PENDING_KEY));

        Self::publish_transfer_event(&env, "transfer_accepted", &pending.from, &pending.to);
        Ok(())
    }

    /// Compute the expiry timestamp for a renewal/registration duration.
    ///
    /// A duration of `0` yields `None` (never expires). A negative duration is
    /// rejected. The result is `now + duration` in ledger seconds.
    fn expiry_from_duration(env: &Env, duration: i64) -> Result<Option<u64>, TagError> {
        if duration < 0 {
            return Err(TagError::InvalidDuration);
        }
        if duration == 0 {
            return Ok(None);
        }
        let now = env.ledger().timestamp();
        Ok(Some(now.saturating_add(duration as u64)))
    }

    /// Whether `tag` is expired at the current ledger timestamp.
    ///
    /// The comparison is inclusive: `expires_at <= now` is expired.
    fn tag_expired(env: &Env, tag: &Tag) -> bool {
        match tag.expires_at {
            Some(expires_at) => expires_at <= env.ledger().timestamp(),
            None => false,
        }
    }

    fn store_tag(
        env: &Env,
        owner: Address,
        name: Symbol,
        expires_at: Option<u64>,
    ) -> Result<(), TagError> {
        if env
            .storage()
            .instance()
            .has(&Symbol::new(env, TAG_KEY))
        {
            return Err(TagError::AlreadyInitialized);
        }
        let tag = Tag {
            owner,
            name,
            expires_at,
        };
        env.storage()
            .instance()
            .set(&Symbol::new(env, TAG_KEY), &tag);
        Ok(())
    }

    fn publish_renewal_event(env: &Env, owner: &Address, expires_at: u64) {
        env.events().publish(
            (Symbol::new(env, "tag_renewed"), owner.clone()),
            expires_at,
        );
    }

    fn publish_wallet_event(env: &Env, topic: &str, owner: &Address, wallet: &Address) {
        env.events().publish(
            (Symbol::new(env, topic), owner.clone()),
            wallet.clone(),
        );
    }

    fn publish_transfer_event(env: &Env, topic: &str, from: &Address, to: &Address) {
        env.events().publish(
            (Symbol::new(env, topic), from.clone()),
            to.clone(),
        );
    }
}
