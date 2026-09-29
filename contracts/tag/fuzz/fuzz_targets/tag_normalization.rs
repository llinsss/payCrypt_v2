//! Coverage-guided target for tag normalization and tag byte lengths.
//!
//! Drives [`tag_contract::harness::check_case`] with arbitrary bytes, so the
//! fuzzer explores raw inputs the fixed-seed `cargo test` sweep cannot reach.
//! Every property the harness checks is byte-oriented and allocation-free, so
//! one input costs one bounded scan.
//!
//! Run with:
//!
//! ```text
//! cargo +nightly fuzz run tag_normalization
//! ```
//!
//! Properties checked, by name reported on failure:
//!
//! | name             | meaning                                              |
//! |------------------|------------------------------------------------------|
//! | `total`          | parsing is pure and every error has a documented code |
//! | `length_bounds`  | an accepted tag is 1..=32 bytes                       |
//! | `charset`        | an accepted tag is only `a-z`, `0-9`, `_`            |
//! | `idempotent`     | normalizing a canonical tag changes nothing          |
//! | `no_growth`      | normalization never grows a tag                      |
//! | `str_fidelity`   | `as_str` matches `as_bytes`                          |
//! | `equivalence`    | `@`, case, and whitespace do not change tag identity |

#![no_main]

use libfuzzer_sys::fuzz_target;
use tag_contract::harness;

fuzz_target!(|raw: &[u8]| {
    if let Err(property) = harness::check_case(raw) {
        panic!("violated {property} for raw input {raw:?}");
    }
});
