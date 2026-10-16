#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Bytes, Env, Symbol, Vec};

/// Storage keys for the tag registry contract.
///
/// Kept explicit and versioned so that future migrations can extend the
/// layout without colliding with existing entries.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Canonical tag -> owner address.
    Owner(Bytes),
    /// Owner address -> list of canonical tags they own.
    OwnedTags(Address),
    /// Canonical tag -> associated wallet address.
    Wallet(Bytes),
    /// Canonical tag -> pending transfer record.
    PendingTransfer(Bytes),
    /// Monotonic counter used to version emitted events.
    Version,
}

/// A pending (two-step) tag transfer awaiting acceptance by the recipient.
#[contracttype]
#[derive(Clone)]
pub struct PendingTransfer {
    /// Current owner that initiated the transfer and may still cancel it.
    pub from: Address,
    /// Intended recipient of the tag.
    pub to: Address,
    /// Ledger timestamp (seconds) after which the transfer is expired.
    pub expires_at: u64,
}

/// Errors surfaced by the registry.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RegistryError {
    /// The supplied tag is empty or otherwise not a valid canonical form.
    InvalidTag = 1,
    /// The tag is already registered to an owner.
    TagAlreadyRegistered = 2,
    /// The tag has not been registered yet.
    TagNotRegistered = 3,
    /// The caller is not the current owner of the tag.
    NotTagOwner = 4,
    /// A zero/invalid address was supplied.
    InvalidAddress = 5,
    /// A pending transfer already exists for this tag.
    TransferAlreadyPending = 6,
    /// No pending transfer exists for this tag.
    NoPendingTransfer = 7,
    /// The pending transfer has expired and can no longer be accepted.
    TransferExpired = 8,
    /// The caller is not the intended recipient of the pending transfer.
    NotTransferRecipient = 9,
}

/// Default lifetime (in seconds) granted to a pending transfer.
pub const DEFAULT_TRANSFER_TTL: u64 = 7 * 24 * 60 * 60;

/// Maximum number of expired pending transfers cleaned up per invocation.
///
/// Bounds the per-invocation work so cleanup can never exceed a fixed cost.
pub const MAX_CLEANUP_BATCH: u32 = 20;

/// Public interface for the canonical tag registry.
pub trait TagRegistryInterface {
    fn register(env: Env, owner: Address, tag: Bytes) -> Result<(), RegistryError>;
    fn resolve(env: Env, tag: Bytes) -> Result<Address, RegistryError>;
    fn transfer(env: Env, from: Address, to: Address, tag: Bytes) -> Result<(), RegistryError>;
    fn associate_wallet(env: Env, owner: Address, tag: Bytes, wallet: Address) -> Result<(), RegistryError>;
    fn wallet_of(env: Env, tag: Bytes) -> Result<Address, RegistryError>;
    fn owner_of(env: Env, tag: Bytes) -> Result<Address, RegistryError>;
}

#[contract]
pub struct TagRegistry;

/// Normalize a tag into its canonical form.
///
/// Canonicalization lowercases ASCII letters and rejects empty tags or tags
/// containing characters outside `[a-z0-9_-]`. This guarantees that two
/// visually equivalent tags map to the same storage key.
fn canonicalize(tag: &Bytes) -> Result<Bytes, RegistryError> {
    let len = tag.len();
    if len == 0 {
        return Err(RegistryError::InvalidTag);
    }
    let mut out = Bytes::new(tag.env());
    let mut i: u32 = 0;
    while i < len {
        let b = tag.get(i).unwrap();
        let c = match b {
            b'A'..=b'Z' => b + 32,
            b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' => b,
            _ => return Err(RegistryError::InvalidTag),
        };
        out.push_back(c);
        i += 1;
    }
    Ok(out)
}

/// Reject the zero address (all-zero bytes) as an invalid owner/wallet.
fn require_nonzero(env: &Env, addr: &Address) -> Result<(), RegistryError> {
    let bytes = addr.to_string();
    let len = bytes.len();
    if len == 0 {
        return Err(RegistryError::InvalidAddress);
    }
    let mut i: u32 = 0;
    let mut all_zero = true;
    while i < len {
        if bytes.get(i).unwrap() != b'0' {
            all_zero = false;
            break;
        }
        i += 1;
    }
    if all_zero {
        return Err(RegistryError::InvalidAddress);
    }
    let _ = env;
    Ok(())
}

fn next_version(env: &Env) -> u32 {
    let current: u32 = env.storage().instance().get(&DataKey::Version).unwrap_or(0);
    let next = current + 1;
    env.storage().instance().set(&DataKey::Version, &next);
    next
}

/// Read the pending transfer for `canonical`, if any.
fn get_pending(env: &Env, canonical: &Bytes) -> Option<PendingTransfer> {
    env.storage()
        .persistent()
        .get(&DataKey::PendingTransfer(canonical.clone()))
}

/// Remove the pending transfer for `canonical` if present.
fn clear_pending(env: &Env, canonical: &Bytes) {
    env.storage()
        .persistent()
        .remove(&DataKey::PendingTransfer(canonical.clone()));
}

/// Remove a pending transfer only if it has expired at `now`.
///
/// Returns `true` when an expired entry was removed. Bounded to a single
/// storage read/remove so callers can iterate a fixed-size batch.
fn cleanup_if_expired(env: &Env, canonical: &Bytes, now: u64) -> bool {
    if let Some(pending) = get_pending(env, canonical) {
        if now >= pending.expires_at {
            clear_pending(env, canonical);
            return true;
        }
    }
    false
}

#[contractimpl]
impl TagRegistry {
    /// Register a new canonical tag for `owner`.
    pub fn register(env: Env, owner: Address, tag: Bytes) -> Result<(), RegistryError> {
        owner.require_auth();
        require_nonzero(&env, &owner)?;
        let canonical = canonicalize(&tag)?;
        let key = DataKey::Owner(canonical.clone());
        if env.storage().persistent().has(&key) {
            return Err(RegistryError::TagAlreadyRegistered);
        }
        env.storage().persistent().set(&key, &owner);

        let owned_key = DataKey::OwnedTags(owner.clone());
        let mut owned: Vec<Bytes> = env
            .storage()
            .persistent()
            .get(&owned_key)
            .unwrap_or(Vec::new(&env));
        owned.push_back(canonical.clone());
        env.storage().persistent().set(&owned_key, &owned);

        let version = next_version(&env);
        env.events().publish(
            (symbol_short!("tag_reg"), version),
            (owner, canonical),
        );
        Ok(())
    }

    /// Resolve a canonical tag to its current owner.
    pub fn resolve(env: Env, tag: Bytes) -> Result<Address, RegistryError> {
        let canonical = canonicalize(&tag)?;
        let owner: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Owner(canonical.clone()))
            .ok_or(RegistryError::TagNotRegistered)?;
        let version = next_version(&env);
        env.events().publish(
            (symbol_short!("tag_res"), version),
            (canonical, owner.clone()),
        );
        Ok(owner)
    }

    /// Transfer ownership of a tag from `from` to `to`.
    pub fn transfer(env: Env, from: Address, to: Address, tag: Bytes) -> Result<(), RegistryError> {
        from.require_auth();
        require_nonzero(&env, &from)?;
        require_nonzero(&env, &to)?;
        let canonical = canonicalize(&tag)?;
        let key = DataKey::Owner(canonical.clone());
        let current: Address = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(RegistryError::TagNotRegistered)?;
        if current != from {
            return Err(RegistryError::NotTagOwner);
        }
        env.storage().persistent().set(&key, &to);

        let from_key = DataKey::OwnedTags(from.clone());
        if let Some(owned) = env.storage().persistent().get::<DataKey, Vec<Bytes>>(&from_key) {
            let mut filtered = Vec::new(&env);
            let mut i: u32 = 0;
            while i < owned.len() {
                let entry = owned.get(i).unwrap();
                if entry != canonical {
                    filtered.push_back(entry);
                }
                i += 1;
            }
            env.storage().persistent().set(&from_key, &filtered);
        }

        let to_key = DataKey::OwnedTags(to.clone());
        let mut to_owned: Vec<Bytes> = env
            .storage()
            .persistent()
            .get(&to_key)
            .unwrap_or(Vec::new(&env));
        to_owned.push_back(canonical.clone());
        env.storage().persistent().set(&to_key, &to_owned);

        let version = next_version(&env);
        env.events().publish(
            (symbol_short!("tag_xfer"), version),
            (from, to, canonical),
        );
        Ok(())
    }

    /// Initiate a pending (two-step) transfer of `tag` from `from` to `to`.
    ///
    /// The tag owner keeps ownership until the recipient accepts. A deadline
    /// of `now + ttl` (defaulting to [`DEFAULT_TRANSFER_TTL`]) is stored so the
    /// pending entry can be cleaned up once it expires. Emits `tag_pend`.
    pub fn initiate_transfer(
        env: Env,
        from: Address,
        to: Address,
        tag: Bytes,
        ttl: Option<u64>,
    ) -> Result<(), RegistryError> {
        from.require_auth();
        require_nonzero(&env, &from)?;
        require_nonzero(&env, &to)?;
        let canonical = canonicalize(&tag)?;
        let current: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Owner(canonical.clone()))
            .ok_or(RegistryError::TagNotRegistered)?;
        if current != from {
            return Err(RegistryError::NotTagOwner);
        }
        let now = env.ledger().timestamp();
        // Reclaim an expired slot before rejecting a duplicate pending entry.
        cleanup_if_expired(&env, &canonical, now);
        if get_pending(&env, &canonical).is_some() {
            return Err(RegistryError::TransferAlreadyPending);
        }
        let lifetime = ttl.unwrap_or(DEFAULT_TRANSFER_TTL);
        let pending = PendingTransfer {
            from: from.clone(),
            to: to.clone(),
            expires_at: now + lifetime,
        };
        env.storage()
            .persistent()
            .set(&DataKey::PendingTransfer(canonical.clone()), &pending);

        let version = next_version(&env);
        env.events().publish(
            (symbol_short!("tag_pend"), version),
            (from, to, canonical, pending.expires_at),
        );
        Ok(())
    }

    /// Accept a pending transfer as the intended recipient.
    ///
    /// Fails with [`RegistryError::TransferExpired`] once the deadline has
    /// passed; the expired entry is removed so storage stays bounded.
    pub fn accept_transfer(env: Env, to: Address, tag: Bytes) -> Result<(), RegistryError> {
        to.require_auth();
        require_nonzero(&env, &to)?;
        let canonical = canonicalize(&tag)?;
        let pending = get_pending(&env, &canonical).ok_or(RegistryError::NoPendingTransfer)?;
        if pending.to != to {
            return Err(RegistryError::NotTransferRecipient);
        }
        let now = env.ledger().timestamp();
        if now >= pending.expires_at {
            clear_pending(&env, &canonical);
            return Err(RegistryError::TransferExpired);
        }
        let key = DataKey::Owner(canonical.clone());
        let current: Address = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(RegistryError::TagNotRegistered)?;
        if current != pending.from {
            // Ownership changed since the request; the pending entry is stale.
            clear_pending(&env, &canonical);
            return Err(RegistryError::NotTagOwner);
        }
        env.storage().persistent().set(&key, &to);

        let from_key = DataKey::OwnedTags(pending.from.clone());
        if let Some(owned) = env.storage().persistent().get::<DataKey, Vec<Bytes>>(&from_key) {
            let mut filtered = Vec::new(&env);
            let mut i: u32 = 0;
            while i < owned.len() {
                let entry = owned.get(i).unwrap();
                if entry != canonical {
                    filtered.push_back(entry);
                }
                i += 1;
            }
            env.storage().persistent().set(&from_key, &filtered);
        }

        let to_key = DataKey::OwnedTags(to.clone());
        let mut to_owned: Vec<Bytes> = env
            .storage()
            .persistent()
            .get(&to_key)
            .unwrap_or(Vec::new(&env));
        to_owned.push_back(canonical.clone());
        env.storage().persistent().set(&to_key, &to_owned);

        clear_pending(&env, &canonical);

        let version = next_version(&env);
        env.events().publish(
            (symbol_short!("tag_xfer"), version),
            (pending.from, to, canonical),
        );
        Ok(())
    }

    /// Cancel a pending transfer as the current tag owner.
    ///
    /// The owner retains the ability to cancel at any time before the
    /// recipient accepts, including after the deadline has passed.
    pub fn cancel_transfer(env: Env, from: Address, tag: Bytes) -> Result<(), RegistryError> {
        from.require_auth();
        require_nonzero(&env, &from)?;
        let canonical = canonicalize(&tag)?;
        let pending = get_pending(&env, &canonical).ok_or(RegistryError::NoPendingTransfer)?;
        if pending.from != from {
            return Err(RegistryError::NotTagOwner);
        }
        clear_pending(&env, &canonical);

        let version = next_version(&env);
        env.events().publish(
            (symbol_short!("tag_cncl"), version),
            (from, canonical),
        );
        Ok(())
    }

    /// Remove up to [`MAX_CLEANUP_BATCH`] expired pending transfers.
    ///
    /// Callers supply the canonical tags to inspect; only entries whose
    /// deadline has passed are removed. Returns the number of entries removed,
    /// keeping per-invocation work bounded regardless of total storage size.
    pub fn cleanup_expired(env: Env, tags: Vec<Bytes>) -> Result<u32, RegistryError> {
        let now = env.ledger().timestamp();
        let mut removed: u32 = 0;
        let mut i: u32 = 0;
        let limit = if tags.len() < MAX_CLEANUP_BATCH {
            tags.len()
        } else {
            MAX_CLEANUP_BATCH
        };
        while i < limit {
            let raw = tags.get(i).unwrap();
            if let Ok(canonical) = canonicalize(&raw) {
                if cleanup_if_expired(&env, &canonical, now) {
                    removed += 1;
                }
            }
            i += 1;
        }
        Ok(removed)
    }

    /// Associate a wallet address with a tag owned by `owner`.
    pub fn associate_wallet(
        env: Env,
        owner: Address,
        tag: Bytes,
        wallet: Address,
    ) -> Result<(), RegistryError> {
        owner.require_auth();
        require_nonzero(&env, &owner)?;
        require_nonzero(&env, &wallet)?;
        let canonical = canonicalize(&tag)?;
        let current: Address = env
            .storage()
            .persistent()
            .get(&DataKey::Owner(canonical.clone()))
            .ok_or(RegistryError::TagNotRegistered)?;
        if current != owner {
            return Err(RegistryError::NotTagOwner);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Wallet(canonical.clone()), &wallet);

        let version = next_version(&env);
        env.events().publish(
            (symbol_short!("tag_wall"), version),
            (canonical, wallet),
        );
        Ok(())
    }

    /// Return the wallet associated with a tag, if any.
    pub fn wallet_of(env: Env, tag: Bytes) -> Result<Address, RegistryError> {
        let canonical = canonicalize(&tag)?;
        env.storage()
            .persistent()
            .get(&DataKey::Wallet(canonical))
            .ok_or(RegistryError::TagNotRegistered)
    }

    /// Return the current owner of a tag.
    pub fn owner_of(env: Env, tag: Bytes) -> Result<Address, RegistryError> {
        let canonical = canonicalize(&tag)?;
        env.storage()
            .persistent()
            .get(&DataKey::Owner(canonical))
            .ok_or(RegistryError::TagNotRegistered)
    }
}
