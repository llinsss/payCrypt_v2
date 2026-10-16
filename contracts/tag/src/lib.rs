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
//! # Determinism
//!
//! Normalization reads no ledger state, so a historical replay and a live
//! query produce the same answer for the same input. Ledger-dependent
//! behaviour is confined to the ownership transfer flow, whose state machine
//! and authorization rules are unchanged by normalization.
//!
//! # Transfer proposal lifecycle
//!
//! A pending ownership transfer is a *proposal* with an explicit lifecycle.
//! Each proposal is identified by a monotonically increasing `id` and carries
//! a [`TransferStatus`]:
//!
//! * `Active` — the proposal may still be accepted by its destination.
//! * `Canceled` — the proposer (current owner) revoked it via
//!   [`TagContract::cancel_transfer`].
//! * `Superseded` — a newer proposal for the same tag replaced it.
//! * `Expired` — the proposal's `expires_at` ledger was reached before
//!   acceptance.
//!
//! Only an `Active`, unexpired proposal can be accepted. Attempting to accept
//! a proposal that has been canceled, superseded, or expired fails with
//! [`TagError::TransferNotActive`], so a revocation can never be undone by a
//! late acceptance. Terminal proposals are retained (bounded to the most
//! recent one) so the rejection reason stays observable to indexers.

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
    /// The referenced transfer proposal exists but is no longer `Active`
    /// (canceled, superseded, or expired) and therefore cannot be accepted.
    TransferNotActive = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tag {
    pub owner: Address,
    pub name: Symbol,
}

/// Lifecycle state of a transfer proposal.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TransferStatus {
    /// Acceptable by the destination until `expires_at`.
    Active = 0,
    /// Revoked by the proposer; can never be accepted.
    Canceled = 1,
    /// Replaced by a newer proposal for the same tag; can never be accepted.
    Superseded = 2,
    /// Reached `expires_at` before acceptance; can never be accepted.
    Expired = 3,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingTransfer {
    /// Monotonic identifier, unique per proposal.
    pub id: u64,
    pub from: Address,
    pub to: Address,
    /// Ledger sequence at which the proposal stops being acceptable.
    pub expires_at: u32,
    pub status: TransferStatus,
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
/// Storage key for the monotonic proposal id counter.
const NEXT_ID_KEY: &str = "next_id";
/// Number of ledgers a proposal stays acceptable after being created.
const TRANSFER_TTL_LEDGERS: u32 = 17_280;

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

    pub fn get_tag(env: Env) -> Result<Tag, TagError> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, TAG_KEY))
            .ok_or(TagError::NotInitialized)
    }

    /// Return the current transfer proposal, if any.
    ///
    /// The returned proposal may be in a terminal state (`Canceled`,
    /// `Superseded`, or `Expired`); callers must check [`PendingTransfer::status`]
    /// before treating it as acceptable.
    pub fn get_pending_transfer(env: Env) -> Option<PendingTransfer> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, PENDING_KEY))
    }

    /// Propose a two-step ownership transfer. The current owner remains
    /// authoritative until the pending owner accepts.
    ///
    /// A new proposal supersedes any existing `Active` proposal for the same
    /// tag: the previous proposal is marked [`TransferStatus::Superseded`] and
    /// can no longer be accepted. The new proposal is `Active` until
    /// `expires_at` (the current ledger plus [`TRANSFER_TTL_LEDGERS`]).
    pub fn propose_transfer(env: Env, to: Address) -> Result<(), TagError> {
        let tag: Tag = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, TAG_KEY))
            .ok_or(TagError::NotInitialized)?;
        tag.owner.require_auth();

        // Supersede any existing active proposal so it can never be accepted.
        if let Some(existing) = Self::get_pending_transfer(env.clone()) {
            if existing.status == TransferStatus::Active {
                let superseded = PendingTransfer {
                    status: TransferStatus::Superseded,
                    ..existing
                };
                env.storage()
                    .instance()
                    .set(&Symbol::new(&env, PENDING_KEY), &superseded);
                Self::publish_transfer_event(
                    &env,
                    "transfer_superseded",
                    &superseded.from,
                    &superseded.to,
                );
            }
        }

        let id = Self::next_id(&env);
        let pending = PendingTransfer {
            id,
            from: tag.owner.clone(),
            to: to.clone(),
            expires_at: env.ledger().sequence().saturating_add(TRANSFER_TTL_LEDGERS),
            status: TransferStatus::Active,
        };
        env.storage()
            .instance()
            .set(&Symbol::new(&env, PENDING_KEY), &pending);

        Self::publish_transfer_event(&env, "transfer_pending", &tag.owner, &to);
        Ok(())
    }

    /// Cancel a pending transfer. Only the current owner may cancel.
    ///
    /// The proposal is marked [`TransferStatus::Canceled`] and can never be
    /// accepted afterwards. Returns [`TagError::NoPendingTransfer`] when there
    /// is no proposal, and [`TagError::TransferNotActive`] when the proposal is
    /// already terminal.
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

        if pending.status != TransferStatus::Active {
            return Err(TagError::TransferNotActive);
        }

        let canceled = PendingTransfer {
            status: TransferStatus::Canceled,
            ..pending
        };
        env.storage()
            .instance()
            .set(&Symbol::new(&env, PENDING_KEY), &canceled);

        Self::publish_transfer_event(&env, "transfer_cancelled", &canceled.from, &canceled.to);
        Ok(())
    }

    /// Accept a pending transfer. Only the pending destination may accept.
    ///
    /// The proposal must be `Active` and not yet expired. A canceled,
    /// superseded, or expired proposal is rejected with
    /// [`TagError::TransferNotActive`], so a revocation cannot be undone by a
    /// late acceptance.
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

        // Reject any proposal that is no longer acceptable. Expiry is derived
        // from the ledger so a stale `Active` proposal cannot be accepted.
        if pending.status != TransferStatus::Active
            || env.ledger().sequence() >= pending.expires_at
        {
            return Err(TagError::TransferNotActive);
        }

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

    /// Monotonic proposal id, persisted so ids are unique across proposals.
    fn next_id(env: &Env) -> u64 {
        let key = Symbol::new(env, NEXT_ID_KEY);
        let current: u64 = env.storage().instance().get(&key).unwrap_or(0);
        let next = current.saturating_add(1);
        env.storage().instance().set(&key, &next);
        next
    }

    fn publish_transfer_event(env: &Env, topic: &str, from: &Address, to: &Address) {
        env.events().publish(
            (Symbol::new(env, topic),),
            (from.clone(), to.clone()),
        );
    }

    fn store_tag(env: &Env, owner: Address, name: Symbol) -> Result<(), TagError> {
        if env.storage().instance().has(&Symbol::new(env, TAG_KEY)) {
            return Err(TagError::AlreadyInitialized);
        }
        let tag = Tag { owner, name };
        env.storage()
            .instance()
            .set(&Symbol::new(env, TAG_KEY), &tag);
        Ok(())
    }

    fn canonicalize(env: &Env, tag: &String) -> Result<Symbol, TagError> {
        let canonical = Self::normalize(tag).map_err(|_| TagError::InvalidTagName)?;
        Ok(Symbol::new(env, canonical.as_str()))
    }

    fn normalize(tag: &String) -> Result<TagName, TagNameError> {
        TagName::new(tag)
    }
}
