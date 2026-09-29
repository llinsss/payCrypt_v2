//! Canonical tag normalization and byte-length limits.
//!
//! # Why normalization is a Rust concern
//!
//! Every surface that can accept a tag agrees on the same two facts, and this
//! module is the single place in the Rust tree that enforces them:
//!
//! * The tag registry stores its name in a Soroban `Symbol`, which accepts only
//!   `a-zA-Z0-9_` and at most **32** characters. `Symbol::new` *panics* on
//!   anything else, so an unvalidated tag is a contract abort rather than a
//!   validation error.
//! * The Solidity `TagRegistry` enforces `0 < bytes(tag).length <= 32`.
//!
//! Normalization is therefore defined as a **total** function: every possible
//! input byte string maps either to a canonical tag or to a deterministic
//! [`TagNameError`]. It never panics, never allocates, and never depends on
//! ledger state, so the same result is produced on-chain, in `cargo test`, and
//! in an off-chain indexer.
//!
//! # Canonical form
//!
//! The steps below run in this order and are the *only* accepted normalization:
//!
//! 1. **ASCII gate.** The first non-ASCII byte is rejected. This makes byte
//!    length equal character length and makes Unicode confusables
//!    (`CYRILLIC SMALL LETTER A`, fullwidth `ａ`, zero-width joiners)
//!    unrepresentable rather than merely discouraged.
//! 2. **Trim** leading and trailing ASCII whitespace.
//! 3. **Strip at most one** leading `@`. A second `@` survives to step 5 and
//!    is rejected, so `@@name` cannot silently normalize to `name`.
//! 4. **Bound the length** of what remains. An over-long input is reported as
//!    [`TagNameError::TooLong`] regardless of its contents, so the rejection
//!    reason for a given length does not depend on which disallowed byte
//!    happens to come first.
//! 5. **ASCII-lowercase** every remaining byte and **validate** the result
//!    against `[a-z0-9_]`.
//!
//! The canonical tag is a strict subset of what a Soroban `Symbol` accepts, so
//! [`TagName`] can always be converted to a `Symbol` without a panic. That
//! subset is what makes canonical form *canonical*: `"Ada"`, `"@Ada"`,
//! `"@ada"` and `"  ADA  "` all resolve to the single stored value `ada`.
//!
//! # Resource limit
//!
//! [`MAX_RAW_SCAN_BYTES`] bounds the work a single call can do. Inputs longer
//! than that are rejected up front with [`TagNameError::InputTooLong`], so an
//! untrusted caller cannot burn unbounded CPU by submitting an arbitrarily long
//! string. Normalization still runs in linear time in the surviving span.

/// Minimum accepted canonical tag length, in bytes.
pub const MIN_TAG_BYTES: usize = 1;

/// Maximum accepted canonical tag length, in bytes.
///
/// Matches the Soroban `Symbol` character limit and the Solidity
/// `TagRegistry` bound, so a canonical tag is representable in both runtimes.
pub const MAX_TAG_BYTES: usize = 32;

/// Upper bound on the raw input a single normalization call will inspect.
///
/// A tag is at most [`MAX_TAG_BYTES`] bytes once normalized, so anything
/// dramatically longer than that is rejected before the normalization loop
/// rather than after it.
pub const MAX_RAW_SCAN_BYTES: usize = 64;

/// The single character stripped from the front of a tag.
const AT_PREFIX: u8 = b'@';

/// Why a raw byte string is not a valid tag.
///
/// Every variant is deterministic and carries the offending position, so the
/// same input always produces the same error on every runtime. Error positions
/// are indices into the **original** input, which keeps client-side error
/// reporting aligned with what the user typed.
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord, Hash)]
pub enum TagNameError {
    /// Normalization produced an empty tag (`""`, `"@"`, `"   "`, `"@  "`).
    Empty,
    /// The raw input exceeded [`MAX_RAW_SCAN_BYTES`] before normalization.
    ///
    /// This is a resource-limit guard, not a statement about the tag itself.
    InputTooLong {
        /// Length of the raw input in bytes.
        byte_len: usize,
        /// The limit that was exceeded.
        max: usize,
    },
    /// A non-ASCII byte was found; the input is not representable as a tag.
    NonAscii {
        /// Byte offset of the first non-ASCII byte.
        index: usize,
        /// The offending byte.
        byte: u8,
    },
    /// A byte outside `a-z0-9_` survived ASCII folding.
    DisallowedByte {
        /// Byte offset of the offending byte.
        index: usize,
        /// The offending byte, before folding.
        byte: u8,
    },
    /// The post-trim, post-prefix input is longer than [`MAX_TAG_BYTES`].
    ///
    /// The bound is checked before the charset, so an over-long input reports
    /// `TooLong` even when it also contains bytes outside `[a-z0-9_]`. Reporting
    /// the dominant reason keeps the rejection stable under further padding.
    TooLong {
        /// Length of the post-trim, post-prefix input in bytes.
        byte_len: usize,
        /// The limit that was exceeded.
        max: usize,
    },
}

impl TagNameError {
    /// Stable numeric code for this error, safe to use as an event topic, an
    /// indexer dimension, and a monitoring counter label.
    ///
    /// These values are part of the public contract: they are appended to, and
    /// never renumbered.
    pub const EMPTY: u32 = 1;
    /// See [`TagNameError::InputTooLong`].
    pub const INPUT_TOO_LONG: u32 = 2;
    /// See [`TagNameError::NonAscii`].
    pub const NON_ASCII: u32 = 3;
    /// See [`TagNameError::DisallowedByte`].
    pub const DISALLOWED_BYTE: u32 = 4;
    /// See [`TagNameError::TooLong`].
    pub const TOO_LONG: u32 = 5;

    /// Stable numeric code for this error.
    pub const fn code(self) -> u32 {
        match self {
            Self::Empty => Self::EMPTY,
            Self::InputTooLong { .. } => Self::INPUT_TOO_LONG,
            Self::NonAscii { .. } => Self::NON_ASCII,
            Self::DisallowedByte { .. } => Self::DISALLOWED_BYTE,
            Self::TooLong { .. } => Self::TOO_LONG,
        }
    }
}

/// A validated, canonical tag.
///
/// The invariant `as_str()` is always non-empty, at most
/// [`MAX_TAG_BYTES`] bytes long, and contains only `a-z`, `0-9` and `_` is
/// upheld by construction: a `TagName` can only be produced by
/// [`TagName::parse`], which enforces it. Every accessor is infallible, so
/// downstream code (including a Soroban `Symbol` conversion) never has to
/// re-check it.
#[derive(Clone, Copy, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub struct TagName {
    bytes: [u8; MAX_TAG_BYTES],
    len: u8,
}

impl TagName {
    /// Normalize and validate a tag supplied as a string slice.
    pub fn parse(raw: &str) -> Result<Self, TagNameError> {
        Self::parse_bytes(raw.as_bytes())
    }

    /// Normalize and validate a tag supplied as raw bytes.
    ///
    /// This is the primitive the fuzz harness drives: it is total over every
    /// possible input, including inputs that are not valid UTF-8.
    pub fn parse_bytes(raw: &[u8]) -> Result<Self, TagNameError> {
        if raw.len() > MAX_RAW_SCAN_BYTES {
            return Err(TagNameError::InputTooLong {
                byte_len: raw.len(),
                max: MAX_RAW_SCAN_BYTES,
            });
        }

        // Step 1: ASCII gate. Checked over the whole input so the reported
        // offset points at the first offending byte rather than the first one
        // that happens to survive trimming.
        for (index, &byte) in raw.iter().enumerate() {
            if !byte.is_ascii() {
                return Err(TagNameError::NonAscii { index, byte });
            }
        }

        // Step 2: trim ASCII whitespace.
        let start = raw.iter().position(|b| !b.is_ascii_whitespace());
        let Some(start) = start else {
            return Err(TagNameError::Empty);
        };
        let end = raw
            .iter()
            .rposition(|b| !b.is_ascii_whitespace())
            .map_or(start, |last| last + 1);

        // Step 3: strip at most one leading '@'.
        let cursor = if raw[start] == AT_PREFIX {
            start + 1
        } else {
            start
        };

        // A tag that is nothing but an optional '@' and whitespace is empty,
        // which is a different rejection from an over-long or malformed one.
        let span = end - cursor;
        if span == 0 {
            return Err(TagNameError::Empty);
        }

        // Step 4: bound the surviving span before validating it, so an
        // over-long input reports the dominant reason rather than whichever
        // disallowed byte happens to come first.
        if span > MAX_TAG_BYTES {
            return Err(TagNameError::TooLong {
                byte_len: span,
                max: MAX_TAG_BYTES,
            });
        }

        // Step 5: fold to lowercase and reject anything outside the tag
        // charset. `span <= MAX_TAG_BYTES` is established above, so the
        // writes below are in bounds by construction.
        let mut name = Self {
            bytes: [0; MAX_TAG_BYTES],
            len: span as u8,
        };
        for (offset, &byte) in raw[cursor..end].iter().enumerate() {
            let folded = byte.to_ascii_lowercase();
            if !is_tag_byte(folded) {
                return Err(TagNameError::DisallowedByte {
                    index: cursor + offset,
                    byte,
                });
            }
            name.bytes[offset] = folded;
        }

        Ok(name)
    }

    /// Canonical tag bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes[..self.len as usize]
    }

    /// Canonical tag as a string slice.
    ///
    /// Infallible: the constructor only admits ASCII bytes, so the UTF-8
    /// conversion cannot fail. It still returns `""` rather than panicking if
    /// that invariant is ever broken, because this accessor is reached from
    /// fuzz targets and must not introduce a panic path of its own.
    pub fn as_str(&self) -> &str {
        core::str::from_utf8(self.as_bytes()).unwrap_or_default()
    }

    /// Canonical length in bytes, which is also the character count.
    pub fn byte_len(&self) -> usize {
        self.len as usize
    }

    /// Whether the canonical tag is empty.
    ///
    /// Always `false` for a constructed `TagName`; provided so callers can
    /// assert the invariant without reaching into private state.
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }
}

impl core::fmt::Debug for TagName {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        formatter
            .debug_struct("TagName")
            .field("value", &self.as_str())
            .field("byte_len", &self.byte_len())
            .finish()
    }
}

impl core::fmt::Display for TagName {
    fn fmt(&self, formatter: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl PartialEq<str> for TagName {
    fn eq(&self, other: &str) -> bool {
        self.as_str() == other
    }
}

impl PartialEq<&str> for TagName {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}

/// Whether `byte` is inside the canonical tag charset `[a-z0-9_]`.
const fn is_tag_byte(byte: u8) -> bool {
    byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_'
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{format, vec, vec::Vec};

    fn assert_ok(raw: &str, expected: &str) {
        let parsed = TagName::parse(raw).unwrap_or_else(|error| {
            panic!("expected {raw:?} to normalize to {expected:?}, got {error:?}")
        });
        assert_eq!(parsed.as_str(), expected);
        assert_eq!(parsed.byte_len(), expected.len());
        assert_eq!(TagName::parse(parsed.as_str()), Ok(parsed));
    }

    fn assert_err(raw: &str, expected: TagNameError) {
        assert_eq!(TagName::parse(raw), Err(expected), "input {raw:?}");
    }

    #[test]
    fn normalizes_case_prefix_and_surrounding_whitespace() {
        assert_ok("alice", "alice");
        assert_ok("ALICE", "alice");
        assert_ok("@alice", "alice");
        assert_ok("  @AlIcE\t\n", "alice");
        assert_ok("a_l_i_c_e", "a_l_i_c_e");
        assert_ok("ALICE99", "alice99");
    }

    #[test]
    fn strips_at_most_one_at_prefix() {
        assert_err(
            "@@alice",
            TagNameError::DisallowedByte {
                index: 1,
                byte: b'@',
            },
        );
        assert_err(
            "@ alice",
            TagNameError::DisallowedByte {
                index: 1,
                byte: b' ',
            },
        );
    }

    #[test]
    fn empty_forms_are_rejected() {
        assert_err("", TagNameError::Empty);
        assert_err("   ", TagNameError::Empty);
        assert_err("@", TagNameError::Empty);
        assert_err("  @  ", TagNameError::Empty);
        assert_err("\t\r\n", TagNameError::Empty);
    }

    #[test]
    fn enforces_the_lower_byte_bound() {
        assert_eq!(TagName::parse("a").map(|tag| tag.byte_len()), Ok(1));
    }

    #[test]
    fn enforces_the_upper_byte_bound_exactly() {
        let at_limit = "a".repeat(MAX_TAG_BYTES);
        let over_limit = "a".repeat(MAX_TAG_BYTES + 1);
        assert_eq!(
            TagName::parse(&at_limit).map(|tag| tag.byte_len()),
            Ok(MAX_TAG_BYTES)
        );
        assert_eq!(
            TagName::parse(&over_limit),
            Err(TagNameError::TooLong {
                byte_len: MAX_TAG_BYTES + 1,
                max: MAX_TAG_BYTES,
            })
        );
    }

    #[test]
    fn enforces_the_raw_scan_bound_independently_of_the_tag_bound() {
        // Whitespace is trimmed, so a 36-byte padded tag is within the raw
        // scan limit and is accepted at exactly the tag limit.
        let padded = format!("  {}  ", "a".repeat(MAX_TAG_BYTES));
        assert_eq!(padded.len(), MAX_TAG_BYTES + 4);
        assert_eq!(
            TagName::parse(&padded).map(|tag| tag.byte_len()),
            Ok(MAX_TAG_BYTES)
        );

        // At the raw limit the guard does not fire, so the input is judged on
        // its merits: 64 spaces trim to nothing.
        let at_limit = " ".repeat(MAX_RAW_SCAN_BYTES);
        assert_eq!(TagName::parse(&at_limit), Err(TagNameError::Empty));
        assert_eq!(
            TagName::parse(&"a".repeat(MAX_RAW_SCAN_BYTES)),
            Err(TagNameError::TooLong {
                byte_len: MAX_RAW_SCAN_BYTES,
                max: MAX_TAG_BYTES,
            }),
            "an over-long but otherwise valid tag reports the tag bound"
        );

        // One byte past the raw limit trips the resource guard, which is
        // checked before anything else.
        let over_limit = " ".repeat(MAX_RAW_SCAN_BYTES + 1);
        assert_eq!(
            TagName::parse(&over_limit),
            Err(TagNameError::InputTooLong {
                byte_len: MAX_RAW_SCAN_BYTES + 1,
                max: MAX_RAW_SCAN_BYTES,
            })
        );
    }

    #[test]
    fn the_raw_guard_is_checked_before_the_tag_bound() {
        let over = "a".repeat(MAX_RAW_SCAN_BYTES + 1);
        assert_eq!(
            TagName::parse(&over),
            Err(TagNameError::InputTooLong {
                byte_len: MAX_RAW_SCAN_BYTES + 1,
                max: MAX_RAW_SCAN_BYTES,
            })
        );
    }

    #[test]
    fn rejects_non_ascii_at_the_first_offending_offset() {
        assert_eq!(
            TagName::parse("al\u{00ee}ce"),
            Err(TagNameError::NonAscii {
                index: 2,
                byte: 0xc3
            })
        );
        // Cyrillic 'а' (U+0430) and fullwidth 'ａ' (U+FF41) are the classic
        // confusables for ASCII 'a'; both must be rejected, never folded.
        assert_eq!(
            TagName::parse("\u{0430}lice"),
            Err(TagNameError::NonAscii {
                index: 0,
                byte: 0xd0
            })
        );
        assert_eq!(
            TagName::parse("\u{ff41}lice"),
            Err(TagNameError::NonAscii {
                index: 0,
                byte: 0xef
            })
        );
        // Zero-width joiner between ASCII bytes.
        assert_eq!(
            TagName::parse("al\u{200d}ice"),
            Err(TagNameError::NonAscii {
                index: 2,
                byte: 0xe2
            })
        );
        // Emoji surrogate-free but non-ASCII.
        assert_eq!(
            TagName::parse("\u{1f600}"),
            Err(TagNameError::NonAscii {
                index: 0,
                byte: 0xf0
            })
        );
    }

    #[test]
    fn rejects_bytes_outside_the_tag_charset() {
        assert_eq!(
            TagName::parse("al-ice"),
            Err(TagNameError::DisallowedByte {
                index: 2,
                byte: b'-'
            })
        );
        assert_eq!(
            TagName::parse("al ice"),
            Err(TagNameError::DisallowedByte {
                index: 2,
                byte: b' '
            })
        );
        assert_eq!(
            TagName::parse("al.ice"),
            Err(TagNameError::DisallowedByte {
                index: 2,
                byte: b'.'
            })
        );
        assert_eq!(
            TagName::parse("al\0ice"),
            Err(TagNameError::DisallowedByte { index: 2, byte: 0 })
        );
        assert_eq!(
            TagName::parse("al\tice"),
            Err(TagNameError::DisallowedByte {
                index: 2,
                byte: b'\t'
            })
        );
    }

    #[test]
    fn error_codes_are_stable_and_distinct() {
        let all = [
            TagNameError::Empty,
            TagNameError::InputTooLong {
                byte_len: 0,
                max: 0,
            },
            TagNameError::NonAscii { index: 0, byte: 0 },
            TagNameError::DisallowedByte { index: 0, byte: 0 },
            TagNameError::TooLong {
                byte_len: 0,
                max: 0,
            },
        ];
        let codes: Vec<u32> = all.iter().map(|error| error.code()).collect();
        assert_eq!(codes, vec![1, 2, 3, 4, 5]);
        let mut sorted = codes;
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), all.len(), "error codes must be unique");
    }

    #[test]
    fn debug_and_display_show_the_canonical_value() {
        let tag = TagName::parse("  @AlIcE ").expect("valid");
        assert_eq!(format!("{tag}"), "alice");
        assert_eq!(
            format!("{tag:?}"),
            "TagName { value: \"alice\", byte_len: 5 }"
        );
    }

    #[test]
    fn compares_against_str_slices() {
        let tag = TagName::parse("@Alice").expect("valid");
        assert!(tag == "alice");
        assert_eq!(tag, *"alice");
    }
}
