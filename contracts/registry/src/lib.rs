#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, String, Vec};

/// Storage keys used by the registry contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Monotonic counter used to allocate tag ids.
    NextTagId,
    /// A tag record keyed by its id.
    Tag(u64),
    /// Set of tag ids currently owned by a wallet.
    WalletTags(Address),
    /// Tombstone marker preventing reuse of a released tag id.
    Released(u64),
    /// Schema version of the persisted registry state.
    SchemaVersion,
}

/// Current persisted registry schema version.
///
/// Bump this whenever the on-chain storage layout changes so that upgrade
/// compatibility can be asserted against state written by prior versions.
pub const CURRENT_SCHEMA_VERSION: u32 = 1;

/// A registry tag binding a human readable name to an owning wallet.
#[contracttype]
#[derive(Clone)]
pub struct Tag {
    pub id: u64,
    pub name: String,
    pub owner: Address,
    pub active: bool,
}

/// Error codes returned by the registry contract.
#[contracterror]
#[repr(u32)]
pub enum RegistryError {
    /// The referenced tag id does not exist.
    TagNotFound = 1,
    /// The caller is not authorized to perform the operation.
    Unauthorized = 2,
    /// The tag id has been released and cannot be reused.
    TagReleased = 3,
    /// The tag is already inactive/released.
    TagInactive = 4,
}

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    /// Register a new tag owned by `owner` and return its freshly allocated id.
    pub fn register(env: Env, owner: Address, name: String) -> u64 {
        owner.require_auth();

        let id: u64 = env.storage().instance().get(&DataKey::NextTagId).unwrap_or(0);
        env.storage().instance().set(&DataKey::NextTagId, &(id + 1));

        let tag = Tag {
            id,
            name,
            owner: owner.clone(),
            active: true,
        };
        env.storage().persistent().set(&DataKey::Tag(id), &tag);

        let mut owned: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::WalletTags(owner.clone()))
            .unwrap_or(Vec::new(&env));
        owned.push_back(id);
        env.storage()
            .persistent()
            .set(&DataKey::WalletTags(owner), &owned);

        id
    }

    /// Release a tag, clearing its wallet association and preventing id reuse.
    ///
    /// Only the current tag owner may release the tag. On success the tag is
    /// marked inactive, removed from the owner's wallet association set, and a
    /// tombstone is written so the id can never be reallocated.
    pub fn release(env: Env, owner: Address, id: u64) -> Result<(), RegistryError> {
        owner.require_auth();

        if env.storage().persistent().has(&DataKey::Released(id)) {
            return Err(RegistryError::TagReleased);
        }

        let mut tag: Tag = env
            .storage()
            .persistent()
            .get(&DataKey::Tag(id))
            .ok_or(RegistryError::TagNotFound)?;

        if tag.owner != owner {
            return Err(RegistryError::Unauthorized);
        }
        if !tag.active {
            return Err(RegistryError::TagInactive);
        }

        // Clear the wallet association for the prior owner.
        let owned: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::WalletTags(owner.clone()))
            .unwrap_or(Vec::new(&env));
        let mut remaining: Vec<u64> = Vec::new(&env);
        for existing in owned.iter() {
            if existing != id {
                remaining.push_back(existing);
            }
        }
        env.storage()
            .persistent()
            .set(&DataKey::WalletTags(owner), &remaining);

        // Mark the tag inactive and record a tombstone to block id reuse.
        tag.active = false;
        env.storage().persistent().set(&DataKey::Tag(id), &tag);
        env.storage().persistent().set(&DataKey::Released(id), &true);

        Ok(())
    }

    /// Return the tag record for `id`, if it exists.
    pub fn get_tag(env: Env, id: u64) -> Option<Tag> {
        env.storage().persistent().get(&DataKey::Tag(id))
    }

    /// Return the tag ids currently associated with `owner`.
    pub fn tags_of(env: Env, owner: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::WalletTags(owner))
            .unwrap_or(Vec::new(&env))
    }

    /// Return the persisted registry schema version.
    ///
    /// State written before the schema version key existed reports `0`, which
    /// lets an upgraded implementation detect and migrate legacy state.
    pub fn schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SchemaVersion)
            .unwrap_or(0)
    }

    /// Record the current schema version in instance storage.
    ///
    /// Called by an upgraded implementation to stamp state it has migrated to
    /// the current layout. Idempotent and bounded to a single storage write.
    pub fn set_schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .set(&DataKey::SchemaVersion, &CURRENT_SCHEMA_VERSION);
        CURRENT_SCHEMA_VERSION
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    fn setup() -> (Env, RegistryContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        (env, client, owner)
    }

    #[test]
    fn release_clears_wallet_association() {
        let (env, client, owner) = setup();
        let id = client.register(&owner, &String::from_str(&env, "alice"));
        assert_eq!(client.tags_of(&owner).len(), 1);

        client.release(&owner, &id);

        assert_eq!(client.tags_of(&owner).len(), 0);
        let tag = client.get_tag(&id).unwrap();
        assert!(!tag.active);
    }

    #[test]
    fn release_requires_owner_auth() {
        let (env, client, owner) = setup();
        let id = client.register(&owner, &String::from_str(&env, "alice"));
        let stranger = Address::generate(&env);

        let result = client.try_release(&stranger, &id);
        assert_eq!(result, Err(Ok(RegistryError::Unauthorized)));
    }

    #[test]
    fn released_id_cannot_be_reused() {
        let (env, client, owner) = setup();
        let id = client.register(&owner, &String::from_str(&env, "alice"));
        client.release(&owner, &id);

        let result = client.try_release(&owner, &id);
        assert_eq!(result, Err(Ok(RegistryError::TagReleased)));
    }

    #[test]
    fn release_unknown_tag_fails() {
        let (_env, client, owner) = setup();
        let result = client.try_release(&owner, &999);
        assert_eq!(result, Err(Ok(RegistryError::TagNotFound)));
    }

    #[test]
    fn legacy_state_reports_zero_schema_version() {
        let (_env, client, _owner) = setup();
        // State written before the schema version key existed reports 0.
        assert_eq!(client.schema_version(), 0);
    }

    #[test]
    fn upgrade_preserves_owner_wallet_and_version() {
        let (env, client, owner) = setup();
        let id = client.register(&owner, &String::from_str(&env, "alice"));

        // Simulate an upgrade: the next implementation stamps the schema version
        // and must still read the state written by the current schema.
        let version = client.set_schema_version();
        assert_eq!(version, CURRENT_SCHEMA_VERSION);
        assert_eq!(client.schema_version(), CURRENT_SCHEMA_VERSION);

        // Owner and wallet association survive the upgrade.
        let tag = client.get_tag(&id).unwrap();
        assert_eq!(tag.owner, owner);
        assert!(tag.active);
        assert_eq!(client.tags_of(&owner).len(), 1);
        assert_eq!(client.tags_of(&owner).get(0).unwrap(), id);
    }

    #[test]
    fn upgrade_preserves_released_tombstone() {
        let (env, client, owner) = setup();
        let id = client.register(&owner, &String::from_str(&env, "alice"));
        client.release(&owner, &id);

        client.set_schema_version();

        // Released state and tombstone remain intact after the upgrade.
        let tag = client.get_tag(&id).unwrap();
        assert!(!tag.active);
        assert_eq!(client.tags_of(&owner).len(), 0);
        let result = client.try_release(&owner, &id);
        assert_eq!(result, Err(Ok(RegistryError::TagReleased)));
    }

    #[test]
    fn set_schema_version_is_idempotent() {
        let (_env, client, _owner) = setup();
        assert_eq!(client.set_schema_version(), CURRENT_SCHEMA_VERSION);
        assert_eq!(client.set_schema_version(), CURRENT_SCHEMA_VERSION);
        assert_eq!(client.schema_version(), CURRENT_SCHEMA_VERSION);
    }
}
