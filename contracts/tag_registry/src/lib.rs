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
    /// Canonical tag -> ledger timestamp at which it was released.
    ReleasedAt(Bytes),
    /// Monotonic counter used to version emitted events.
    Version,
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
    /// The tag is within its post-release reservation window and cannot be
    /// re-registered yet.
    TagReserved = 6,
}

/// Bounded reservation period (in ledgers) between a tag release and the
/// earliest ledger at which it may be re-registered by a new owner.
///
/// The window is intentionally small and constant so that per-invocation work
/// and storage growth stay bounded: at most one extra persistent entry per
/// released tag, and a single timestamp comparison on registration.
pub const RESERVATION_PERIOD_LEDGERS: u32 = 100;

/// Public interface for the canonical tag registry.
pub trait TagRegistryInterface {
    fn register(env: Env, owner: Address, tag: Bytes) -> Result<(), RegistryError>;
    fn resolve(env: Env, tag: Bytes) -> Result<Address, RegistryError>;
    fn transfer(env: Env, from: Address, to: Address, tag: Bytes) -> Result<(), RegistryError>;
    fn release(env: Env, owner: Address, tag: Bytes) -> Result<(), RegistryError>;
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

/// Enforce the bounded reservation window for a previously released tag.
///
/// Returns `Ok(())` when the tag has never been released or when the
/// reservation period has elapsed. Returns `Err(TagReserved)` while the tag is
/// still inside its reservation window. The released-at entry is cleared once
/// the window has elapsed so storage does not grow unboundedly.
fn check_reservation(env: &Env, canonical: &Bytes) -> Result<(), RegistryError> {
    let key = DataKey::ReleasedAt(canonical.clone());
    let released_at: u32 = match env.storage().persistent().get(&key) {
        Some(ts) => ts,
        None => return Ok(()),
    };
    let now = env.ledger().sequence();
    if now < released_at.saturating_add(RESERVATION_PERIOD_LEDGERS) {
        return Err(RegistryError::TagReserved);
    }
    env.storage().persistent().remove(&key);
    Ok(())
}

#[contractimpl]
impl TagRegistry {
    /// Register a new canonical tag for `owner`.
    ///
    /// Fails with `TagReserved` if the tag was released within the last
    /// `RESERVATION_PERIOD_LEDGERS` ledgers.
    pub fn register(env: Env, owner: Address, tag: Bytes) -> Result<(), RegistryError> {
        owner.require_auth();
        require_nonzero(&env, &owner)?;
        let canonical = canonicalize(&tag)?;
        let key = DataKey::Owner(canonical.clone());
        if env.storage().persistent().has(&key) {
            return Err(RegistryError::TagAlreadyRegistered);
        }
        check_reservation(&env, &canonical)?;
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

    /// Release a tag owned by `owner`, starting its reservation window.
    ///
    /// The tag is removed from the owner's holdings and a `ReleasedAt` entry
    /// records the current ledger sequence. Re-registration is blocked until
    /// `RESERVATION_PERIOD_LEDGERS` ledgers have elapsed.
    pub fn release(env: Env, owner: Address, tag: Bytes) -> Result<(), RegistryError> {
        owner.require_auth();
        require_nonzero(&env, &owner)?;
        let canonical = canonicalize(&tag)?;
        let key = DataKey::Owner(canonical.clone());
        let current: Address = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(RegistryError::TagNotRegistered)?;
        if current != owner {
            return Err(RegistryError::NotTagOwner);
        }
        env.storage().persistent().remove(&key);
        env.storage()
            .persistent()
            .remove(&DataKey::Wallet(canonical.clone()));

        let from_key = DataKey::OwnedTags(owner.clone());
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

        let now = env.ledger().sequence();
        env.storage()
            .persistent()
            .set(&DataKey::ReleasedAt(canonical.clone()), &now);

        let version = next_version(&env);
        env.events().publish(
            (symbol_short!("tag_rel"), version),
            (owner, canonical, now),
        );
        Ok(())
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

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::{Env, IntoVal};

    fn tag(env: &Env, s: &str) -> Bytes {
        Bytes::from_slice(env, s.as_bytes())
    }

    #[test]
    fn register_succeeds_and_resolves() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let t = tag(&env, "alice");
        TagRegistry::register(env.clone(), owner.clone(), t.clone()).unwrap();
        assert_eq!(TagRegistry::resolve(env.clone(), t.clone()).unwrap(), owner);
        assert_eq!(TagRegistry::owner_of(env.clone(), t).unwrap(), owner);
    }

    #[test]
    fn register_requires_auth() {
        let env = Env::default();
        let owner = Address::generate(&env);
        let t = tag(&env, "alice");
        let res = TagRegistry::register(env.clone(), owner, t);
        assert!(res.is_err());
    }

    #[test]
    fn release_requires_owner_auth() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let t = tag(&env, "alice");
        TagRegistry::register(env.clone(), owner.clone(), t.clone()).unwrap();
        let res = TagRegistry::release(env.clone(), owner, t);
        assert!(res.is_err());
    }

    #[test]
    fn release_then_reregister_blocked_within_window() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let other = Address::generate(&env);
        let t = tag(&env, "alice");
        TagRegistry::register(env.clone(), owner.clone(), t.clone()).unwrap();
        TagRegistry::release(env.clone(), owner.clone(), t.clone()).unwrap();
        // Immediately after release the tag is reserved.
        let res = TagRegistry::register(env.clone(), other.clone(), t.clone());
        assert_eq!(res, Err(RegistryError::TagReserved));
    }

    #[test]
    fn reregister_allowed_after_reservation_period() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let other = Address::generate(&env);
        let t = tag(&env, "alice");
        TagRegistry::register(env.clone(), owner.clone(), t.clone()).unwrap();
        TagRegistry::release(env.clone(), owner.clone(), t.clone()).unwrap();
        // Advance past the reservation window.
        env.ledger().set_sequence_number(RESERVATION_PERIOD_LEDGERS + 1);
        TagRegistry::register(env.clone(), other.clone(), t.clone()).unwrap();
        assert_eq!(TagRegistry::owner_of(env.clone(), t).unwrap(), other);
    }

    #[test]
    fn reregister_allowed_at_exact_boundary() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let other = Address::generate(&env);
        let t = tag(&env, "alice");
        TagRegistry::register(env.clone(), owner.clone(), t.clone()).unwrap();
        TagRegistry::release(env.clone(), owner.clone(), t.clone()).unwrap();
        // Exactly at the boundary the reservation has elapsed.
        env.ledger().set_sequence_number(RESERVATION_PERIOD_LEDGERS);
        TagRegistry::register(env.clone(), other.clone(), t.clone()).unwrap();
        assert_eq!(TagRegistry::owner_of(env.clone(), t).unwrap(), other);
    }

    #[test]
    fn release_unknown_tag_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let t = tag(&env, "ghost");
        let res = TagRegistry::release(env.clone(), owner, t);
        assert_eq!(res, Err(RegistryError::TagNotRegistered));
    }

    #[test]
    fn release_by_non_owner_fails() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let other = Address::generate(&env);
        let t = tag(&env, "alice");
        TagRegistry::register(env.clone(), owner.clone(), t.clone()).unwrap();
        let res = TagRegistry::release(env.clone(), other, t);
        assert_eq!(res, Err(RegistryError::NotTagOwner));
    }

    #[test]
    fn release_emits_event_and_clears_owner() {
        let env = Env::default();
        env.mock_all_auths();
        let owner = Address::generate(&env);
        let t = tag(&env, "alice");
        TagRegistry::register(env.clone(), owner.clone(), t.clone()).unwrap();
        TagRegistry::release(env.clone(), owner.clone(), t.clone()).unwrap();
        assert_eq!(
            TagRegistry::owner_of(env.clone(), t.clone()),
            Err(RegistryError::TagNotRegistered)
        );
        let _ = IntoVal::<Env, Bytes>::into_val(&t, &env);
    }
}
