//! Coverage-guided target for the spelling variants of an accepted tag.
//!
//! Where `tag_normalization` lets the fuzzer control the *raw input*, this
//! target lets it control the *valid tag* and checks that every spelling of
//! that tag normalizes back to it. That concentrates coverage on the
//! neighbourhood of tags a client actually submits, which is where tag
//! identity would otherwise split.
//!
//! The fuzzer's input is used only as a seed for the harness's own
//! deterministic generator, so a minimized input stays minimized.
//!
//! Run with:
//!
//! ```text
//! cargo +nightly fuzz run tag_equivalence
//! ```

#![no_main]

use libfuzzer_sys::fuzz_target;
use tag_contract::harness;

fuzz_target!(|seed: &[u8]| {
    match harness::check_tag_equivalence(seed) {
        Ok(()) => {}
        // An empty input carries no seed, so the harness has no tag to build
        // variants from. libFuzzer produces the empty input routinely (it is
        // the minimal element of the corpus and libFuzzer tries it early), and
        // there is no equivalence claim to check without a tag, so this is not
        // a property violation. Returning without asserting keeps an expected
        // input from being reported as a crash.
        Err(harness::PROPERTY_NO_SEED) => {}
        Err(property) => panic!("violated {property} for equivalence seed {seed:?}"),
    }
});
