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
    /// The supplied wallet is already the tag's associated wallet.
    WalletAlreadyAssociated = 6,
}

/// Public interface for the canonical tag registry.
pub trait TagRegistryInterface {
    fn register(env: Env, owner: Address, tag: Bytes) -> Result<(), RegistryError>;
    fn resolve(env: Env, tag: Bytes) -> Result<Address, RegistryError>;
    fn transfer(env: Env, from: Address, to: Address, tag: Bytes) -> Result<(), RegistryError>;
    fn associate_wallet(env: Env, owner: Address, tag: Bytes, wallet: Address) -> Result<(), RegistryError>;
    fn reassociate_wallet(env: Env, owner: Address, tag: Bytes, wallet: Address) -> Result<(), RegistryError>;
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

    /// Associate a wallet address with a tag owned by `owner`.
    ///
    /// This is the initial association path: the tag must not already have a
    /// wallet linked. Only the current tag owner must authorize.
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
        let wallet_key = DataKey::Wallet(canonical.clone());
        if env.storage().persistent().has(&wallet_key) {
            return Err(RegistryError::WalletAlreadyAssociated);
        }
        env.storage().persistent().set(&wallet_key, &wallet);

        let version = next_version(&env);
        env.events().publish(
            (symbol_short!("tag_wall"), version),
            (canonical, wallet),
        );
        Ok(())
    }

    /// Reassociate a tag with a different wallet address.
    ///
    /// Authorization policy for changing the linked wallet:
    /// - The current tag owner must always authorize the change.
    /// - If the tag already has a linked wallet, that current wallet must also
    ///   authorize, preventing an owner from silently detaching a wallet that
    ///   has not consented to the reassociation.
    /// - The new wallet must be non-zero and distinct from the current wallet.
    pub fn reassociate_wallet(
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
        let wallet_key = DataKey::Wallet(canonical.clone());
        let previous: Address = env
            .storage()
            .persistent()
            .get(&wallet_key)
            .ok_or(RegistryError::TagNotRegistered)?;
        if previous == wallet {
            return Err(RegistryError::WalletAlreadyAssociated);
        }
        previous.require_auth();
        env.storage().persistent().set(&wallet_key, &wallet);

        let version = next_version(&env);
        env.events().publish(
            (symbol_short!("tag_reas"), version),
            (canonical, previous, wallet),
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

    /// Return the owner of a tag.
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
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Env, IntoVal};

    fn tag(env: &Env, s: &str) -> Bytes {
        Bytes::from_slice(env, s.as_bytes())
    }

    #[test]
    fn reassociate_success_requires_owner_and_current_wallet() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TagRegistry);
        let client = TagRegistryClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let wallet_a = Address::generate(&env);
        let wallet_b = Address::generate(&env);
        let t = tag(&env, "alice");

        client.register(&owner, &t);
        client.associate_wallet(&owner, &t, &wallet_a);
        client.reassociate_wallet(&owner, &t, &wallet_b);

        assert_eq!(client.wallet_of(&t), wallet_b);
    }

    #[test]
    fn reassociate_requires_current_wallet_auth() {
        let env = Env::default();
        let contract_id = env.register_contract(None, TagRegistry);
        let client = TagRegistryClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let wallet_a = Address::generate(&env);
        let wallet_b = Address::generate(&env);
        let t = tag(&env, "alice");

        env.mock_auths(&[
            &soroban_sdk::testutils::MockAuth {
                address: &owner,
                invoke: &soroban_sdk::testutils::MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "register",
                    args: (&owner, &t).into_val(&env),
                    sub_invokes: &[],
                },
            },
            &soroban_sdk::testutils::MockAuth {
                address: &owner,
                invoke: &soroban_sdk::testutils::MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "associate_wallet",
                    args: (&owner, &t, &wallet_a).into_val(&env),
                    sub_invokes: &[],
                },
            },
            &soroban_sdk::testutils::MockAuth {
                address: &owner,
                invoke: &soroban_sdk::testutils::MockAuthInvoke {
                    contract: &contract_id,
                    fn_name: "reassociate_wallet",
                    args: (&owner, &t, &wallet_b).into_val(&env),
                    sub_invokes: &[],
                },
            },
        ]);

        client.register(&owner, &t);
        client.associate_wallet(&owner, &t, &wallet_a);
        let res = client.try_reassociate_wallet(&owner, &t, &wallet_b);
        assert!(res.is_err());
    }

    #[test]
    fn reassociate_rejects_same_wallet() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TagRegistry);
        let client = TagRegistryClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let wallet_a = Address::generate(&env);
        let t = tag(&env, "alice");

        client.register(&owner, &t);
        client.associate_wallet(&owner, &t, &wallet_a);
        let res = client.try_reassociate_wallet(&owner, &t, &wallet_a);
        assert_eq!(res, Err(Ok(RegistryError::WalletAlreadyAssociated)));
    }

    #[test]
    fn reassociate_fails_when_no_wallet_linked() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TagRegistry);
        let client = TagRegistryClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let wallet_b = Address::generate(&env);
        let t = tag(&env, "alice");

        client.register(&owner, &t);
        let res = client.try_reassociate_wallet(&owner, &t, &wallet_b);
        assert_eq!(res, Err(Ok(RegistryError::TagNotRegistered)));
    }

    #[test]
    fn reassociate_fails_for_non_owner() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TagRegistry);
        let client = TagRegistryClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let other = Address::generate(&env);
        let wallet_a = Address::generate(&env);
        let wallet_b = Address::generate(&env);
        let t = tag(&env, "alice");

        client.register(&owner, &t);
        client.associate_wallet(&owner, &t, &wallet_a);
        let res = client.try_reassociate_wallet(&other, &t, &wallet_b);
        assert_eq!(res, Err(Ok(RegistryError::NotTagOwner)));
    }

    #[test]
    fn associate_wallet_rejects_second_association() {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TagRegistry);
        let client = TagRegistryClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let wallet_a = Address::generate(&env);
        let wallet_b = Address::generate(&env);
        let t = tag(&env, "alice");

        client.register(&owner, &t);
        client.associate_wallet(&owner, &t, &wallet_a);
        let res = client.try_associate_wallet(&owner, &t, &wallet_b);
        assert_eq!(res, Err(Ok(RegistryError::WalletAlreadyAssociated)));
    }
}
