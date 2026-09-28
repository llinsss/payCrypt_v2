//! Deterministic fuzz harness for tag normalization and tag byte lengths.
//!
//! The same corpus generator and the same property set run in three places:
//!
//! * `cargo test` in this crate, where a fixed seed makes every run identical
//!   and a failure is reproducible from the printed seed alone.
//! * `cargo fuzz run tag_normalization`, where the generated case is replaced
//!   by the fuzzer's coverage-guided input.
//! * `cargo fuzz run tag_equivalence`, which lets the fuzzer drive a *valid*
//!   tag rather than a raw input, concentrating coverage on the neighbourhood of
//!   tags a client would actually submit.
//!
//! Everything here is `no_std`, allocation-free, and independent of ledger
//! state, so a reported violation is reproducible on any machine. There is no
//! randomness that is not derived from an explicit seed.

use crate::normalize::{TagName, MAX_RAW_SCAN_BYTES, MAX_TAG_BYTES, MIN_TAG_BYTES};

/// Parsing is total: the same bytes always produce the same result, and any
/// failure carries one of the documented error codes.
pub const PROPERTY_TOTAL: &str = "total";
/// An accepted tag's length is within `[MIN_TAG_BYTES, MAX_TAG_BYTES]`.
pub const PROPERTY_LENGTH_BOUNDS: &str = "length_bounds";
/// An accepted tag contains only `a-z`, `0-9` and `_`.
pub const PROPERTY_CHARSET: &str = "charset";
/// Normalizing an already-canonical tag is a no-op.
pub const PROPERTY_IDEMPOTENT: &str = "idempotent";
/// Normalization never grows a tag.
pub const PROPERTY_NO_GROWTH: &str = "no_growth";
/// `as_str` reports exactly the bytes `as_bytes` returns.
pub const PROPERTY_STR_FIDELITY: &str = "str_fidelity";
/// Tag identity ignores `@` prefix, ASCII case, and surrounding whitespace.
pub const PROPERTY_EQUIVALENCE: &str = "equivalence";

/// Every property this harness checks, in report order.
pub const PROPERTIES: [&str; 7] = [
    PROPERTY_TOTAL,
    PROPERTY_LENGTH_BOUNDS,
    PROPERTY_CHARSET,
    PROPERTY_IDEMPOTENT,
    PROPERTY_NO_GROWTH,
    PROPERTY_STR_FIDELITY,
    PROPERTY_EQUIVALENCE,
];

/// Number of documented error codes; a code outside this range means the error
/// enum grew without the harness being updated.
const ERROR_CODE_COUNT: u32 = 5;

/// Deterministic xorshift64* generator.
///
/// Chosen over a dependency so the corpus is byte-identical across platforms
/// and toolchain versions, and so the fuzz targets do not pull extra crates
/// into the audited dependency graph.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rng {
    state: u64,
}

impl Rng {
    /// Seed the generator. Any seed is valid; a zero seed is forced to a
    /// non-zero state so the stream never degenerates.
    pub fn new(seed: u64) -> Self {
        Self { state: seed | 1 }
    }

    /// Derive a seed from arbitrary bytes, such as a fuzzer's current input.
    ///
    /// FNV-1a is used because the mapping has to be fixed and simple: the same
    /// input must always produce the same cases, on any machine and any
    /// toolchain, so a minimized finding stays minimized.
    ///
    /// Returns `None` for empty input, which carries no seed at all; fuzz
    /// targets treat that as "nothing to do for this input".
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        if bytes.is_empty() {
            return None;
        }
        // FNV-1a 64-bit constants.
        let mut state = 0xcbf2_9ce4_8422_2325_u64;
        for byte in bytes {
            state ^= u64::from(*byte);
            state = state.wrapping_mul(0x0000_0100_0000_01b3);
        }
        Some(Self::new(state))
    }

    /// Next value in the stream.
    pub fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545_f491_4f6c_dd1d)
    }

    /// Value in `0..bound`, using rejection sampling so the distribution does
    /// not depend on modulo bias.
    ///
    /// # Panics
    ///
    /// Panics if `bound` is zero.
    pub fn below(&mut self, bound: usize) -> usize {
        assert!(bound > 0, "bound must be positive");
        let bound = bound as u64;
        let zone = u64::MAX - (u64::MAX % bound) - 1;
        loop {
            let value = self.next_u64();
            if value <= zone {
                return (value % bound) as usize;
            }
        }
    }

    /// Choose a byte from `alphabet`, or any byte when `alphabet` is empty.
    pub fn from_alphabet(&mut self, alphabet: &[u8]) -> u8 {
        if alphabet.is_empty() {
            return self.next_u64() as u8;
        }
        alphabet[self.below(alphabet.len())]
    }
}

/// Byte alphabet used when the generator is not in "any byte" mode: the tag
/// charset plus the bytes normalization is expected to handle.
const TAG_ALPHABET: &[u8] =
    b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_@. \t\r\n";

/// Generate one case into `out`, returning the number of meaningful bytes.
///
/// The length is drawn from the *boundary* set rather than uniformly, because
/// almost every interesting bug in a bounded, trimming normalizer lives at a
/// length edge: zero, one, the tag maximum, the tag maximum plus one, and the
/// raw scan limit.
pub fn generate_case(rng: &mut Rng, out: &mut [u8; MAX_RAW_SCAN_BYTES]) -> usize {
    const BOUNDARY_LENGTHS: [usize; 8] = [
        0,
        1,
        2,
        MIN_TAG_BYTES,
        MAX_TAG_BYTES,
        MAX_TAG_BYTES + 1,
        MAX_RAW_SCAN_BYTES - 1,
        MAX_RAW_SCAN_BYTES,
    ];

    let len = BOUNDARY_LENGTHS[rng.below(BOUNDARY_LENGTHS.len())].min(MAX_RAW_SCAN_BYTES);
    // One case in four is drawn from the full byte range so the ASCII gate and
    // the resource-limit guard are exercised with arbitrary data, not just
    // plausible tags.
    let any_byte = rng.below(4) == 0;
    let alphabet: &[u8] = if any_byte { &[] } else { TAG_ALPHABET };

    for slot in out.iter_mut().take(len) {
        *slot = rng.from_alphabet(alphabet);
    }
    len
}

/// Hand-written corpus: the cases a random generator would take longest to
/// reach, or would never reach at all.
pub const CORPUS: [&[u8]; 24] = [
    b"",
    b" ",
    b"@",
    b"@@",
    b"@ ",
    b" @ ",
    b"a",
    b"A",
    b"_",
    b"__",
    b"a_b",
    b"@Alice",
    b"  @ALICE\t\r\n",
    b"al-ice",
    b"al.ice",
    b"al ice",
    b"al\0ice",
    b"a\0",
    b"0",
    b"0xDEADBEEF",
    b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    b"  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  ",
    "al\u{e9}ce".as_bytes(),
];

/// How many equivalence variants [`check_case`] verifies.
const EQUIVALENCE_VARIANTS: usize = 3;

/// Bytes each equivalence variant adds around the canonical tag: the uppercase
/// variant adds none, the `@`-prefixed variant adds one, and the
/// whitespace-padded variant adds two.
const EQUIVALENCE_PADDINGS: [usize; EQUIVALENCE_VARIANTS] = [0, 1, 2];

/// Largest equivalence variant, in bytes: the canonical tag plus either one
/// `@` prefix or one byte of surrounding whitespace on each side.
const MAX_EQUIVALENCE_VARIANT: usize = MAX_TAG_BYTES + 2;

// Every variant writer stays inside its fixed-size buffer because a canonical
// tag can never exceed the tag limit.
const _: () = assert!(MAX_EQUIVALENCE_VARIANT <= MAX_RAW_SCAN_BYTES);

/// Write `tag` uppercased into `buffer`; returns the variant length.
fn write_upper_variant(tag: &TagName, buffer: &mut [u8; MAX_RAW_SCAN_BYTES]) -> usize {
    let canonical = tag.as_bytes();
    for (slot, byte) in buffer.iter_mut().zip(canonical) {
        *slot = byte.to_ascii_uppercase();
    }
    canonical.len()
}

/// Write `@` + `tag` into `buffer`; returns the variant length.
fn write_prefix_variant(tag: &TagName, buffer: &mut [u8; MAX_RAW_SCAN_BYTES]) -> usize {
    let canonical = tag.as_bytes();
    buffer[0] = b'@';
    buffer[1..=canonical.len()].copy_from_slice(canonical);
    canonical.len() + 1
}

/// Write ` <tag>\n` into `buffer`; returns the variant length.
fn write_padded_variant(tag: &TagName, buffer: &mut [u8; MAX_RAW_SCAN_BYTES]) -> usize {
    let canonical = tag.as_bytes();
    buffer[0] = b' ';
    buffer[1..=canonical.len()].copy_from_slice(canonical);
    buffer[canonical.len() + 1] = b'\n';
    canonical.len() + 2
}

/// Check every property for one raw input.
///
/// Returns `Ok(())` when the input is rejected — rejection needs no further
/// invariant — or when all properties hold, and the name of the violated
/// property otherwise.
pub fn check_case(raw: &[u8]) -> Result<(), &'static str> {
    // PROPERTY_TOTAL: parsing is pure, deterministic, and every failure is one
    // of the documented error codes.
    let parsed = TagName::parse_bytes(raw);
    if parsed != TagName::parse_bytes(raw) {
        return Err(PROPERTY_TOTAL);
    }
    let tag = match parsed {
        Ok(tag) => tag,
        Err(error) => {
            return if (1..=ERROR_CODE_COUNT).contains(&error.code()) {
                Ok(())
            } else {
                Err(PROPERTY_TOTAL)
            }
        }
    };

    // PROPERTY_LENGTH_BOUNDS
    if tag.is_empty() || tag.byte_len() < MIN_TAG_BYTES || tag.byte_len() > MAX_TAG_BYTES {
        return Err(PROPERTY_LENGTH_BOUNDS);
    }

    // PROPERTY_CHARSET
    if !tag
        .as_bytes()
        .iter()
        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'_')
    {
        return Err(PROPERTY_CHARSET);
    }

    // PROPERTY_NO_GROWTH: normalization only ever removes bytes.
    if tag.byte_len() > raw.len() {
        return Err(PROPERTY_NO_GROWTH);
    }

    // PROPERTY_IDEMPOTENT
    if TagName::parse_bytes(tag.as_bytes()) != Ok(tag) {
        return Err(PROPERTY_IDEMPOTENT);
    }

    // PROPERTY_STR_FIDELITY
    if tag.as_str().len() != tag.byte_len() {
        return Err(PROPERTY_STR_FIDELITY);
    }

    // PROPERTY_EQUIVALENCE.
    check_equivalence_variants(&tag)
}

/// Check that every spelling variant of `tag` normalizes back to `tag`.
///
/// Each variant is written and checked before the next one overwrites the
/// shared buffer. A variant longer than the raw scan limit would be rejected by
/// the resource guard instead of being normalized, so it is skipped; the guard
/// has its own property tests.
fn check_equivalence_variants(tag: &TagName) -> Result<(), &'static str> {
    let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];
    let mut checked = 0usize;
    for padding in EQUIVALENCE_PADDINGS {
        if tag.byte_len() + padding > MAX_RAW_SCAN_BYTES {
            continue;
        }
        let len = match padding {
            0 => write_upper_variant(tag, &mut buffer),
            1 => write_prefix_variant(tag, &mut buffer),
            _ => write_padded_variant(tag, &mut buffer),
        };
        if TagName::parse_bytes(&buffer[..len]) != Ok(*tag) {
            return Err(PROPERTY_EQUIVALENCE);
        }
        checked += 1;
    }
    // The uppercase variant is always within the scan limit, so at least one
    // equivalence variant is verified for every accepted tag.
    assert!(checked >= 1, "at least one equivalence variant must fit");
    Ok(())
}

/// Charset used to build an already-canonical tag.
const CANONICAL_ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789_";

/// Check the equivalence property around a tag derived from `seed_bytes`.
///
/// This is a different input distribution from [`check_case`]: the fuzzer
/// controls the *valid* tag, not the raw input, so coverage is concentrated on
/// the neighbourhood of tags a client would actually submit. Every accepted tag
/// must be reproduced exactly by its uppercase, `@`-prefixed, and
/// whitespace-padded spellings.
pub fn check_tag_equivalence(seed_bytes: &[u8]) -> Result<(), &'static str> {
    let mut rng = Rng::from_bytes(seed_bytes).ok_or(PROPERTY_TOTAL)?;
    let len = MIN_TAG_BYTES + rng.below(MAX_TAG_BYTES - MIN_TAG_BYTES + 1);
    let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];
    for slot in buffer.iter_mut().take(len) {
        *slot = rng.from_alphabet(CANONICAL_ALPHABET);
    }

    // The generated bytes are already canonical, so parsing must accept them
    // unchanged: this is PROPERTY_IDEMPOTENT and PROPERTY_NO_GROWTH checked
    // from the generating side.
    let tag = TagName::parse_bytes(&buffer[..len]).map_err(|_| PROPERTY_IDEMPOTENT)?;
    if tag.byte_len() != len {
        return Err(PROPERTY_LENGTH_BOUNDS);
    }
    check_case(&buffer[..len])?;
    check_equivalence_variants(&tag)
}

/// Run every property over the hand-written corpus.
pub fn check_corpus() -> Result<(), &'static str> {
    for case in CORPUS {
        check_case(case)?;
    }
    Ok(())
}

/// Run every property over `count` generated cases derived from `seed`.
///
/// Returns the 1-based index of the first failing case so a failure report is
/// reproducible by replaying the same seed.
pub fn check_generated(seed: u64, count: usize) -> Result<(), (usize, &'static str)> {
    let mut rng = Rng::new(seed);
    let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];
    for index in 0..count {
        let len = generate_case(&mut rng, &mut buffer);
        if let Err(property) = check_case(&buffer[..len]) {
            return Err((index + 1, property));
        }
    }
    Ok(())
}

/// Run the equivalence property over `count` tags derived from `seed`.
///
/// Returns the 1-based index of the first failing tag.
pub fn check_generated_equivalence(seed: u64, count: usize) -> Result<(), (usize, &'static str)> {
    let mut rng = Rng::new(seed);
    let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];
    for index in 0..count {
        let len = MIN_TAG_BYTES + rng.below(MAX_TAG_BYTES - MIN_TAG_BYTES + 1);
        for slot in buffer.iter_mut().take(len) {
            *slot = rng.from_alphabet(CANONICAL_ALPHABET);
        }
        if let Err(property) = check_tag_equivalence(&buffer[..len]) {
            return Err((index + 1, property));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::normalize::TagNameError;
    use std::vec::Vec;

    /// Seeds exercised by `cargo test`. Fixed so the suite is deterministic;
    /// changing one is a deliberate act, not something CI does.
    const TEST_SEEDS: [u64; 4] = [
        0x0000_0000_0000_0001,
        0x5eed_1234_abcd_0001,
        0xdead_beef_cafe_f00d,
        u64::MAX,
    ];

    /// Cases per seed. Large enough to sweep the boundary lengths many times,
    /// small enough to keep the suite fast.
    const CASES_PER_SEED: usize = 20_000;

    #[test]
    fn generator_is_deterministic_for_a_fixed_seed() {
        let mut first = Rng::new(0x5eed_1234_abcd_0001);
        let mut second = Rng::new(0x5eed_1234_abcd_0001);
        let mut a = [0u8; MAX_RAW_SCAN_BYTES];
        let mut b = [0u8; MAX_RAW_SCAN_BYTES];
        for _ in 0..256 {
            let len_a = generate_case(&mut first, &mut a);
            let len_b = generate_case(&mut second, &mut b);
            assert_eq!(len_a, len_b);
            assert_eq!(&a[..len_a], &b[..len_b]);
        }
    }

    #[test]
    fn generator_never_exceeds_the_raw_scan_bound() {
        let mut rng = Rng::new(0x00c0_ffee_0000_0001);
        let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];
        for _ in 0..5_000 {
            let len = generate_case(&mut rng, &mut buffer);
            assert!(len <= MAX_RAW_SCAN_BYTES);
        }
    }

    #[test]
    fn handwritten_corpus_satisfies_every_property() {
        check_corpus().expect("hand-written corpus must satisfy all properties");
    }

    #[test]
    fn generated_corpus_satisfies_every_property() {
        for seed in TEST_SEEDS {
            if let Err((index, property)) = check_generated(seed, CASES_PER_SEED) {
                panic!("seed {seed:#x}: case {index} violated {property}");
            }
        }
    }

    #[test]
    fn generated_tags_satisfy_the_equivalence_property() {
        for seed in TEST_SEEDS {
            if let Err((index, property)) = check_generated_equivalence(seed, CASES_PER_SEED) {
                panic!("seed {seed:#x}: tag {index} violated {property}");
            }
        }
    }

    #[test]
    fn seeding_from_bytes_is_deterministic_and_total() {
        assert_eq!(Rng::from_bytes(b""), None, "empty input carries no seed");
        assert_eq!(Rng::from_bytes(b"alice"), Rng::from_bytes(b"alice"));
        assert_ne!(Rng::from_bytes(b"alice"), Rng::from_bytes(b"bob"));
        // A seed is never degenerate, whatever the input.
        let mut rng = Rng::from_bytes(&[0; 32]).expect("non-empty");
        let values: Vec<u64> = (0..8).map(|_| rng.next_u64()).collect();
        assert!(values.iter().any(|value| *value != 0));
    }

    #[test]
    fn every_single_byte_is_handled_without_panicking() {
        let mut raw = [0u8; 1];
        for byte in 0u8..=u8::MAX {
            raw[0] = byte;
            let _ = check_case(&raw);
            let _ = TagName::parse_bytes(&raw);
        }
    }

    #[test]
    fn every_two_byte_tag_alphabet_pair_is_handled() {
        let mut raw = [0u8; 2];
        for first in TAG_ALPHABET {
            for second in TAG_ALPHABET {
                raw[0] = *first;
                raw[1] = *second;
                if let Err(property) = check_case(&raw) {
                    panic!("{} {} violated {property}", *first as char, *second as char);
                }
            }
        }
    }

    #[test]
    fn oversized_inputs_are_rejected_by_the_resource_guard() {
        let mut raw = [b'a'; MAX_RAW_SCAN_BYTES + 1];
        assert_eq!(
            TagName::parse_bytes(&raw),
            Err(TagNameError::InputTooLong {
                byte_len: MAX_RAW_SCAN_BYTES + 1,
                max: MAX_RAW_SCAN_BYTES,
            })
        );
        raw[0] = b'@';
        assert!(matches!(
            TagName::parse_bytes(&raw),
            Err(TagNameError::InputTooLong { .. })
        ));
        check_case(&raw).expect("rejection needs no further invariant");
    }

    #[test]
    fn property_names_are_unique() {
        let mut names = PROPERTIES;
        names.sort_unstable();
        for pair in names.windows(2) {
            assert_ne!(pair[0], pair[1], "property names must be unique");
        }
    }

    #[test]
    fn equivalence_variants_stay_inside_the_scan_buffer() {
        let longest = TagName::parse_bytes(&[b'a'; MAX_TAG_BYTES]).expect("at the tag limit");
        let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];
        let lengths = [
            write_upper_variant(&longest, &mut buffer),
            write_prefix_variant(&longest, &mut buffer),
            write_padded_variant(&longest, &mut buffer),
        ];
        for len in lengths {
            assert!(len <= MAX_EQUIVALENCE_VARIANT);
            assert!(len <= MAX_RAW_SCAN_BYTES);
        }
    }
}
