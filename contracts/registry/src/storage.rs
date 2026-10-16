use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::error::RegistryError;

/// Maximum number of entries returned by a single paginated listing call.
/// Keeps per-invocation work and response size bounded.
pub const MAX_PAGE_SIZE: u32 = 50;

/// Default page size used when the caller does not specify a limit.
pub const DEFAULT_PAGE_SIZE: u32 = 20;

/// Current on-chain schema version for persisted registry records.
///
/// Bump this whenever the persisted layout of [`RegistryRecord`] changes so
/// that [`read_record`] can transparently upgrade older entries.
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

/// Highest schema version this contract revision can persist.
///
/// [`write_record`] refuses to write once the schema version reaches this
/// value, so the counter can never wrap around to a stale version.
pub const MAX_SCHEMA_VERSION: u32 = u32::MAX;

/// A single registry entry keyed by its tag.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegistryEntry {
    pub tag: String,
    pub owner: Address,
}

/// Cursor used to resume a paginated listing.
///
/// The cursor encodes the last tag returned by the previous page. Ordering is
/// stable and lexicographic over the tag, so a cursor always resumes exactly
/// after the entry it points at.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PageCursor {
    pub after: String,
}

/// A page of registry entries plus the cursor to fetch the next page.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegistryPage {
    pub entries: Vec<RegistryEntry>,
    /// `None` when this is the final page.
    pub next: Option<PageCursor>,
}

/// Persisted registry record.
///
/// `schema_version` is stored alongside the payload so that records written by
/// an older contract revision can be detected and upgraded on read.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RegistryRecord {
    pub schema_version: u32,
    pub owner: Address,
    pub name: String,
    pub metadata: String,
}

/// Storage key for the ordered list of registered tags.
#[contracttype]
#[derive(Clone)]
enum DataKey {
    Tags,
}

fn read_tags(env: &Env) -> Vec<String> {
    env.storage()
        .persistent()
        .get(&DataKey::Tags)
        .unwrap_or_else(|| Vec::new(env))
}

fn write_tags(env: &Env, tags: &Vec<String>) {
    env.storage().persistent().set(&DataKey::Tags, tags);
}

fn record_key(env: &Env, id: u64) -> (soroban_sdk::Symbol, u64) {
    (soroban_sdk::Symbol::new(env, "record"), id)
}

/// Register a tag, keeping the tag list sorted for stable pagination.
pub fn register(env: &Env, tag: String, owner: Address) -> Result<(), RegistryError> {
    let mut tags = read_tags(env);
    if tags.iter().any(|t| t == tag) {
        return Err(RegistryError::AlreadyRegistered);
    }

    // Insert in sorted position to keep ordering stable across pages.
    let mut sorted = Vec::new(env);
    let mut inserted = false;
    for existing in tags.iter() {
        if !inserted && tag < existing {
            sorted.push_back(tag.clone());
            inserted = true;
        }
        sorted.push_back(existing);
    }
    if !inserted {
        sorted.push_back(tag.clone());
    }
    tags = sorted;
    write_tags(env, &tags);

    env.storage()
        .persistent()
        .set(&(tag.clone(), owner.clone()), &owner);
    Ok(())
}

/// Transfer ownership of an existing tag to `new_owner`.
///
/// The tag's ownership record and its associated wallet association are
/// updated together: either both are written or neither is. Validation runs
/// before any storage mutation, so a rejected transfer leaves the registry
/// untouched.
///
/// Errors:
/// * [`RegistryError::NotRegistered`] — the tag has no owner record.
/// * [`RegistryError::Unauthorized`] — `current_owner` does not match the
///   stored owner.
///
/// On success the stored owner for `tag` becomes `new_owner`; the tag list is
/// unchanged, so pagination ordering and cursors remain valid.
pub fn transfer(
    env: &Env,
    tag: String,
    current_owner: Address,
    new_owner: Address,
) -> Result<(), RegistryError> {
    // Validate first: no storage is mutated until every check passes.
    let stored: Address = match env
        .storage()
        .persistent()
        .get(&(tag.clone(), tag.clone()))
    {
        Some(owner) => owner,
        None => return Err(RegistryError::NotRegistered),
    };
    if stored != current_owner {
        return Err(RegistryError::Unauthorized);
    }

    // Commit ownership and the associated wallet association together.
    env.storage()
        .persistent()
        .set(&(tag.clone(), tag.clone()), &new_owner);
    env.storage()
        .persistent()
        .set(&(tag.clone(), new_owner.clone()), &new_owner);
    Ok(())
}

/// List registry entries with bounded, cursor-based pagination.
///
/// * `cursor` — `None` starts from the beginning; `Some(c)` resumes strictly
///   after `c.after`. A cursor whose tag is not present in the registry is
///   rejected with [`RegistryError::InvalidCursor`].
/// * `limit` — requested page size. `None` uses [`DEFAULT_PAGE_SIZE`]; values
///   above [`MAX_PAGE_SIZE`] are clamped so per-invocation work stays bounded.
///
/// Returns a [`RegistryPage`] whose `next` is `None` on the final page.
/// Ordering is stable and lexicographic by tag.
pub fn list(
    env: &Env,
    cursor: Option<PageCursor>,
    limit: Option<u32>,
) -> Result<RegistryPage, RegistryError> {
    let tags = read_tags(env);
    let page_size = limit.unwrap_or(DEFAULT_PAGE_SIZE).min(MAX_PAGE_SIZE);

    let start = match cursor {
        None => 0,
        Some(c) => {
            let mut found: Option<u32> = None;
            for (i, tag) in tags.iter().enumerate() {
                if tag == c.after {
                    found = Some(i as u32 + 1);
                    break;
                }
            }
            match found {
                Some(idx) => idx,
                None => return Err(RegistryError::InvalidCursor),
            }
        }
    };

    let mut entries = Vec::new(env);
    let total = tags.len();
    let mut i = start;
    while i < total && entries.len() < page_size {
        let tag = tags.get(i).unwrap();
        let owner: Address = env
            .storage()
            .persistent()
            .get(&(tag.clone(), tag.clone()))
            .unwrap_or_else(|| panic!("missing owner"));
        entries.push_back(RegistryEntry {
            tag: tag.clone(),
            owner,
        });
        i += 1;
    }

    let next = if i < total {
        let last = entries.get(entries.len() - 1).unwrap();
        Some(PageCursor { after: last.tag })
    } else {
        None
    };

    Ok(RegistryPage { entries, next })
}

/// Persist a registry record, always stamping it with the current schema
/// version so future revisions can migrate it safely.
///
/// Returns [`RegistryError::VersionOverflow`] when the schema version counter
/// has reached [`MAX_SCHEMA_VERSION`], rather than wrapping to a stale version.
pub fn write_record(
    env: &Env,
    id: u64,
    owner: Address,
    name: String,
    metadata: String,
) -> Result<(), RegistryError> {
    if CURRENT_SCHEMA_VERSION >= MAX_SCHEMA_VERSION {
        return Err(RegistryError::VersionOverflow);
    }

    let record = RegistryRecord {
        schema_version: CURRENT_SCHEMA_VERSION,
        owner,
        name,
        metadata,
    };
    env.storage().persistent().set(&record_key(env, id), &record);
    Ok(())
}

/// Read a registry record, upgrading records written by older schema versions
/// to the current layout before returning them.
///
/// Returns [`RegistryError::NotFound`] when no record is stored for `id`.
pub fn read_record(env: &Env, id: u64) -> Result<RegistryRecord, RegistryError> {
    let key = record_key(env, id);
    let stored: RegistryRecord = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(RegistryError::NotFound)?;

    let upgraded = upgrade_record(env, stored)?;

    // Persist the upgraded record so subsequent reads are cheap and bounded.
    if upgraded.schema_version != stored.schema_version {
        env.storage().persistent().set(&key, &upgraded);
    }

    Ok(upgraded)
}

/// Upgrade a stored record to [`CURRENT_SCHEMA_VERSION`].
///
/// Records already at the current version are returned unchanged. Records from
/// a newer, unknown schema version are rejected rather than silently
/// misinterpreted. The version counter is advanced with checked arithmetic so
/// exhaustion surfaces as [`RegistryError::VersionOverflow`] instead of
/// wrapping to a stale version.
fn upgrade_record(env: &Env, mut record: RegistryRecord) -> Result<RegistryRecord, RegistryError> {
    if record.schema_version > CURRENT_SCHEMA_VERSION {
        return Err(RegistryError::UnsupportedSchemaVersion);
    }

    // v1 -> v2: v1 records were persisted without a schema version and are
    // normalised here by stamping the current version. No payload reshaping is
    // required for this migration step.
    while record.schema_version < CURRENT_SCHEMA_VERSION {
        record.schema_version = record
            .schema_version
            .checked_add(1)
            .ok_or(RegistryError::VersionOverflow)?;
    }

    let _ = env;
    Ok(record)
}
}
