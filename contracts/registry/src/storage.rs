use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::error::RegistryError;

/// Maximum number of entries returned by a single paginated listing call.
/// Keeps per-invocation work and response size bounded.
pub const MAX_PAGE_SIZE: u32 = 50;

/// Default page size used when the caller does not specify a limit.
pub const DEFAULT_PAGE_SIZE: u32 = 20;

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
