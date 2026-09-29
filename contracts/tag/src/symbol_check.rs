//! The Soroban `Symbol` invariant that only an `Env` can check.
//!
//! [`crate::normalize::TagName`] is validated on bytes alone, but the reason
//! those rules exist is that the registry stores the tag in a `Symbol`, and
//! `Symbol::new` **panics** — it does not return an error — when handed a
//! string that is longer than 32 characters or contains a character outside
//! `a-zA-Z0-9_`. A panic in a contract is an unrecoverable transaction failure,
//! so the guarantee "an accepted tag is always a valid `Symbol`" needs its own
//! check against the real host type.
//!
//! `Symbol::new` is called with no `catch_unwind`: if the invariant is ever
//! broken, this module panics and the failure is reported directly, which is
//! exactly what a fuzz target wants.

use alloc::string::ToString;

use soroban_sdk::{Env, String, Symbol};

use crate::normalize::{TagName, MAX_RAW_SCAN_BYTES};

/// Every accepted tag can be built as a `Symbol` without panicking.
pub const PROPERTY_SYMBOL_SAFE: &str = "symbol_safe";
/// The `Symbol` round-trips back to the canonical bytes.
pub const PROPERTY_SYMBOL_FIDELITY: &str = "symbol_fidelity";

/// The invariant list contributed by this module.
pub const PROPERTIES: [&str; 2] = [PROPERTY_SYMBOL_SAFE, PROPERTY_SYMBOL_FIDELITY];

/// Check the `Symbol` invariant for one raw input.
///
/// A rejected input has no canonical form, so only accepted tags are checked.
pub fn check_case(env: &Env, raw: &[u8]) -> Result<(), &'static str> {
    let Ok(tag) = TagName::parse_bytes(raw) else {
        return Ok(());
    };

    // PROPERTY_SYMBOL_SAFE: panics if the canonical tag is not a legal Symbol.
    let symbol = Symbol::new(env, tag.as_str());

    // PROPERTY_SYMBOL_FIDELITY: the Symbol must decode back to the canonical
    // bytes, so an indexer reading the stored symbol sees the same value the
    // client submitted.
    let decoded = symbol.to_string();
    let len = decoded.len();
    if len != tag.byte_len() || len > MAX_RAW_SCAN_BYTES {
        return Err(PROPERTY_SYMBOL_FIDELITY);
    }
    let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];
    buffer[..len].copy_from_slice(decoded.as_bytes());
    if &buffer[..len] != tag.as_bytes() {
        return Err(PROPERTY_SYMBOL_FIDELITY);
    }

    Ok(())
}

/// Check the `Symbol` invariant for a Soroban `String`, the type a caller
/// actually submits.
pub fn check_string(env: &Env, raw: &String) -> Result<(), &'static str> {
    let byte_len = raw.len() as usize;
    if byte_len > MAX_RAW_SCAN_BYTES {
        return Ok(());
    }
    let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];
    raw.copy_into_slice(&mut buffer[..byte_len]);
    check_case(env, &buffer[..byte_len])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures::deterministic_env;
    use crate::harness::{self, Rng};

    const CASES: usize = 2_000;

    #[test]
    fn handwritten_corpus_is_symbol_safe() {
        let env = deterministic_env();
        for case in harness::CORPUS {
            check_case(&env, case)
                .unwrap_or_else(|property| panic!("corpus case {case:?} violated {property}"));
        }
    }

    #[test]
    fn generated_corpus_is_symbol_safe() {
        let env = deterministic_env();
        let mut rng = Rng::new(0x5eed_1234_abcd_0001);
        let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];
        for _ in 0..CASES {
            let len = harness::generate_case(&mut rng, &mut buffer);
            check_case(&env, &buffer[..len]).unwrap_or_else(|property| {
                panic!("generated case {0:?} violated {property}", &buffer[..len])
            });
        }
    }

    #[test]
    fn soroban_string_inputs_are_symbol_safe() {
        let env = deterministic_env();
        for case in harness::CORPUS {
            let raw = String::from_bytes(&env, case);
            check_string(&env, &raw)
                .unwrap_or_else(|property| panic!("string case {case:?} violated {property}"));
        }
    }
}
