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
//! [`TagContract::inspect`] is the single stable inspection entry point for a
//! registered tag: it returns the canonical name, byte length, owner,
//! pending-transfer status, and a monotonically increasing version in one
//! call. It never fails; an uninitialized registry is reported as
//! `initialized == false` rather than as a reverted transaction, so indexers
//! and monitoring can observe the state without simulating a call.
//!
//! # Determinism
//!
//! Normalization reads no ledger state, so a historical replay and a live
//! query produce the same answer for the same input. Ledger-dependent
//! behaviour is confined to the ownership transfer flow, whose state machine
//! and authorization rules are unchanged by normalization.

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
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tag {
    pub owner: Address,
    pub name: Symbol,
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

/// Stable inspection view of the registered tag, as returned by
/// [`TagContract::inspect`].
///
/// This is the single entry point clients and indexers should use to read the
/// registry: it bundles the canonical name, its byte length, the owner, the
/// pending-transfer status, and a version counter into one call. It never
/// fails; an uninitialized registry is reported as `initialized == false` with
/// zeroed fields, so a read cannot revert and cannot be used to probe state
/// through error codes.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TagState {
    /// Whether the registry has been initialized.
    pub initialized: bool,
    /// Canonical tag name, an empty symbol when uninitialized.
    pub canonical: Symbol,
    /// Canonical length in bytes, `0` when uninitialized.
    pub byte_len: u32,
    /// Current owner, the zero address when uninitialized.
    pub owner: Address,
    /// Whether an ownership transfer is currently pending.
    pub pending_transfer: bool,
    /// Pending destination when `pending_transfer` is true.
    pub pending_to: Address,
    /// Monotonically increasing version, bumped on every state change.
    pub version: u32,
}

/// Storage key for the registered tag.
const TAG_KEY: &str = "tag";
/// Storage key for the pending ownership transfer.
const PENDING_KEY: &str = "pending";
/// Storage key for the state version counter.
const VERSION_KEY: &str = "version";

#[contract]
pub struct TagContract;

#[contractimpl]
impl TagContract {
    /// Initialize the registry from an already-canonical tag.
    ///
    /// Retained for clients that canonicalize before submitting. Prefer
    /// [`TagContract::initialize_tag`], which normalizes on-chain so the
    /// canonical form is not trusted from the caller.
    pub fn initialize(env: Env, owner: Address, name: Symbol) -> Result<(), TagError> {
        Self::store_tag(&env, owner, name)
    }

    /// Initialize the registry from a raw, unnormalized tag.
    ///
    /// Applies [`normalize::TagName`] and stores the canonical symbol, so
    /// `"@Ada"`, `"  ADA  "` and `"Ada"` all register the same tag. Returns
    /// [`TagError::InvalidTagName`] if the tag cannot be normalized.
    pub fn initialize_tag(env: Env, owner: Address, tag: String) -> Result<(), TagError> {
        let canonical = Self::canonicalize(&env, &tag)?;
        Self::store_tag(&env, owner, canonical)
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

    /// Single stable inspection view of the registered tag.
    ///
    /// Returns the canonical name, its byte length, the owner, the
    /// pending-transfer status, and the current version in one call. Never
    /// fails: an uninitialized registry is reported as `initialized == false`
    /// with zeroed fields, so callers do not need to handle a reverted read.
    ///
    /// The version is bumped on every state change (initialization, transfer
    /// proposal, cancellation, and acceptance), so indexers can detect changes
    /// without diffing the full state.
    pub fn inspect(env: Env) -> TagState {
        let version = Self::version(&env);
        let tag: Option<Tag> = env.storage().instance().get(&Symbol::new(&env, TAG_KEY));
        let pending: Option<PendingTransfer> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, PENDING_KEY));

        match tag {
            Some(tag) => {
                let (pending_transfer, pending_to) = match pending {
                    Some(p) => (true, p.to),
                    None => (false, tag.owner.clone()),
                };
                TagState {
                    initialized: true,
                    byte_len: tag.name.len(),
                    canonical: tag.name,
                    owner: tag.owner,
                    pending_transfer,
                    pending_to,
                    version,
                }
            }
            None => TagState {
                initialized: false,
                canonical: Symbol::new(&env, ""),
                byte_len: 0,
                owner: Address::from_str(&env, ""),
                pending_transfer: false,
                pending_to: Address::from_str(&env, ""),
                version,
            },
        }
    }

    pub fn get_tag(env: Env) -> Result<Tag, TagError> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, TAG_KEY))
            .ok_or(TagError::NotInitialized)
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
        Self::bump_version(&env);

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
        Self::bump_version(&env);

        Self::publish_transfer_event(&env, "transfer_cancelled", &pending.from, &pending.to);
        Ok(())
    }

    /// Accept a pending transfer. Only the pending destination may accept.
    ///
    /// On success the pending destination becomes the owner and the pending
    /// transfer is cleared. The version is bumped so indexers observe the
    /// ownership change.
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
        Self::bump_version(&env);

        Self::publish_transfer_event(&env, "transfer_accepted", &pending.from, &pending.to);
        Ok(())
    }

    /// Current state version. Starts at `0` and increments on every state
    /// change. Exposed for clients that only need the version.
    pub fn version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, VERSION_KEY))
            .unwrap_or(0)
    }

    /// Increment the stored version counter. Bounded to a single storage
    /// write per state change.
    fn bump_version(env: &Env) {
        let next = Self::version(env.clone()).saturating_add(1);
        env.storage()
            .instance()
            .set(&Symbol::new(env, VERSION_KEY), &next);
    }

    /// Persist a tag and bump the version. Shared by both initializers.
    fn store_tag(env: &Env, owner: Address, name: Symbol) -> Result<(), TagError> {
        if env
            .storage()
            .instance()
            .has(&Symbol::new(env, TAG_KEY))
        {
            return Err(TagError::AlreadyInitialized);
        }
        let tag = Tag { owner, name };
        env.storage()
            .instance()
            .set(&Symbol::new(env, TAG_KEY), &tag);
        Self::bump_version(env);
        Ok(())
    }

    /// Normalize a raw tag, mapping failures to [`TagError::InvalidTagName`].
    fn canonicalize(env: &Env, tag: &String) -> Result<Symbol, TagError> {
        match Self::normalize(tag) {
            Ok(canonical) => Ok(Symbol::new(env, canonical.as_str())),
            Err(_) => Err(TagError::InvalidTagName),
        }
    }

    /// Run the shared normalization routine.
    fn normalize(tag: &String) -> Result<TagName, TagNameError> {
        TagName::new(tag)
    }

    /// Emit a transfer lifecycle event.
    fn publish_transfer_event(env: &Env, topic: &str, from: &Address, to: &Address) {
        env.events().publish(
            (Symbol::new(env, topic), from.clone()),
            to.clone(),
        );
    }
}
