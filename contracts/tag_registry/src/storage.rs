use soroban_sdk::{contracttype, Address, String};

/// Storage keys for the tag registry contract.
///
/// The registry keeps a canonical mapping from a normalized tag to its
/// current owner, plus a reverse index of the tags owned by each wallet.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    /// Canonical tag -> owning address.
    Tag(String),
    /// Owner address -> number of tags currently owned.
    OwnerTagCount(Address),
    /// (Owner address, index) -> canonical tag owned by that address.
    OwnerTag(Address, u32),
    /// Monotonic counter used to version emitted events.
    EventVersion,
}

/// Normalize a tag into its canonical form.
///
/// Canonicalization trims surrounding whitespace and lowercases ASCII
/// characters so that `"Alice"`, `"alice"` and `" alice "` all resolve to
/// the same canonical tag. Returns `None` when the tag is empty after
/// normalization.
pub fn canonicalize_tag(tag: &String) -> Option<String> {
    let len = tag.len();
    if len == 0 {
        return None;
    }

    let mut buf = [0u8; 64];
    let mut out_len = 0usize;
    let mut started = false;
    let mut pending_space = false;

    let mut i = 0u32;
    while i < len {
        let b = tag.get(i).unwrap_or(0);
        i += 1;

        // Treat ASCII whitespace as a separator.
        if b == b' ' || b == b'\t' || b == b'\n' || b == b'\r' {
            if started {
                pending_space = true;
            }
            continue;
        }

        if out_len >= buf.len() {
            return None;
        }

        if pending_space {
            buf[out_len] = b' ';
            out_len += 1;
            pending_space = false;
            if out_len >= buf.len() {
                return None;
            }
        }

        // Lowercase ASCII letters for canonical comparison.
        let lower = if b >= b'A' && b <= b'Z' { b + 32 } else { b };
        buf[out_len] = lower;
        out_len += 1;
        started = true;
    }

    if out_len == 0 {
        return None;
    }

    Some(String::from_bytes(&soroban_sdk::Bytes::from_slice(
        &soroban_sdk::Env::default(),
        &buf[..out_len],
    )))
}

/// Returns `true` when the address is a valid, nonzero owner/wallet.
///
/// Soroban `Address` values are always well-formed, so the only rejection
/// case we enforce here is the all-zero ("zero") address, which must never
/// be registered as an owner or associated wallet.
pub fn is_nonzero_address(addr: &Address) -> bool {
    let bytes = addr.to_string();
    let len = bytes.len();
    if len == 0 {
        return false;
    }

    let mut i = 0u32;
    while i < len {
        let b = bytes.get(i).unwrap_or(0);
        // Any non-zero character means the address is not the zero address.
        if b != b'0' {
            return true;
        }
        i += 1;
    }

    false
}
