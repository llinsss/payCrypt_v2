//! Unicode confusable rejection tests.
//
//! Verifies that characters which look like valid ASCII tag bytes are rejected,
//! never silently normalized. The ASCII gate (step 1 of normalization) is the
//! sole mechanism: any non-ASCII byte in the input produces `TagNameError::NonAscii`.
//
//! Groups:
//! * Latin-look-alike letters  - Cyrillic, Greek, fullwidth
//! * Digits and digit-likes    - fullwidth, superscript, subscript
//! * Underscore confusables    - fullwidth low line, combining forms
//! * Invisible / zero-width    - ZWJ, ZWNJ, soft hyphen, BOM
//! * Emoji and pictographs
//! * Mixed ASCII + confusable  - verifies exact reported byte offset

use crate::normalize::{TagName, TagNameError};

#[track_caller]
fn assert_non_ascii(raw: &str, index: usize, byte: u8) {
    assert_eq!(
        TagName::parse(raw),
        Err(TagNameError::NonAscii { index, byte }),
        "input {raw:?} must be rejected as NonAscii at index {index}"
    );
}

#[track_caller]
fn assert_all_non_ascii(cases: &[&str]) {
    for raw in cases {
        assert!(
            matches!(TagName::parse(raw), Err(TagNameError::NonAscii { .. })),
            "input {raw:?} must be rejected as NonAscii"
        );
    }
}

// Latin-look-alike letters

#[test]
fn cyrillic_a_is_not_ascii_a() {
    // U+0430 CYRILLIC SMALL LETTER A
    assert_non_ascii("\u{0430}lice", 0, 0xd0);
}

#[test]
fn cyrillic_capital_a_is_not_ascii_a() {
    // U+0410 CYRILLIC CAPITAL LETTER A
    assert_non_ascii("\u{0410}lice", 0, 0xd0);
}

#[test]
fn cyrillic_e_is_not_ascii_e() {
    // U+0435 CYRILLIC SMALL LETTER IE
    assert_non_ascii("alic\u{0435}", 4, 0xd0);
}

#[test]
fn cyrillic_o_is_not_ascii_o() {
    // U+043E CYRILLIC SMALL LETTER O
    assert_non_ascii("a\u{043e}ice", 1, 0xd0);
}

#[test]
fn cyrillic_p_is_not_ascii_p() {
    // U+0440 CYRILLIC SMALL LETTER ER
    assert_non_ascii("\u{0440}eer", 0, 0xd1);
}

#[test]
fn cyrillic_c_is_not_ascii_c() {
    // U+0441 CYRILLIC SMALL LETTER ES
    assert_non_ascii("\u{0441}at", 0, 0xd1);
}

#[test]
fn cyrillic_x_is_not_ascii_x() {
    // U+0445 CYRILLIC SMALL LETTER HA
    assert_non_ascii("\u{0445}box", 0, 0xd1);
}

#[test]
fn greek_omicron_is_not_ascii_o() {
    // U+03BF GREEK SMALL LETTER OMICRON
    assert_non_ascii("b\u{03bf}b", 1, 0xce);
}

#[test]
fn greek_alpha_is_not_ascii_a() {
    // U+03B1 GREEK SMALL LETTER ALPHA
    assert_non_ascii("\u{03b1}bc", 0, 0xce);
}

#[test]
fn fullwidth_a_is_not_ascii_a() {
    // U+FF41 FULLWIDTH LATIN SMALL LETTER A
    assert_non_ascii("\u{ff41}lice", 0, 0xef);
}

#[test]
fn fullwidth_z_is_not_ascii_z() {
    // U+FF5A FULLWIDTH LATIN SMALL LETTER Z
    assert_non_ascii("\u{ff5a}ero", 0, 0xef);
}

#[test]
fn fullwidth_capital_a_is_not_ascii_a() {
    // U+FF21 FULLWIDTH LATIN CAPITAL LETTER A
    assert_non_ascii("\u{ff21}lice", 0, 0xef);
}

#[test]
fn dotless_i_is_not_ascii_i() {
    // U+0131 LATIN SMALL LETTER DOTLESS I
    assert_non_ascii("al\u{0131}ce", 2, 0xc4);
}

#[test]
fn o_with_stroke_is_not_ascii_o() {
    // U+00F8 LATIN SMALL LETTER O WITH STROKE
    assert_non_ascii("b\u{00f8}b", 1, 0xc3);
}

#[test]
fn all_cyrillic_ascii_lookalikes_are_rejected() {
    assert_all_non_ascii(&[
        "\u{0430}", // a -> a
        "\u{0435}", // e -> e
        "\u{043e}", // o -> o
        "\u{0440}", // p -> p
        "\u{0441}", // c -> c
        "\u{0445}", // x -> x
        "\u{0443}", // y -> y
        "\u{0456}", // i -> i (Ukrainian)
        "\u{0458}", // j -> j
    ]);
}

// Digits and digit-likes

#[test]
fn fullwidth_digit_zero_is_not_ascii_0() {
    // U+FF10 FULLWIDTH DIGIT ZERO
    assert_non_ascii("\u{ff10}day", 0, 0xef);
}

#[test]
fn fullwidth_digit_nine_is_not_ascii_9() {
    // U+FF19 FULLWIDTH DIGIT NINE
    assert_non_ascii("tag\u{ff19}", 3, 0xef);
}

#[test]
fn superscript_one_is_not_ascii_1() {
    // U+00B9 SUPERSCRIPT ONE
    assert_non_ascii("v\u{00b9}", 1, 0xc2);
}

#[test]
fn subscript_zero_is_not_ascii_0() {
    // U+2080 SUBSCRIPT ZERO
    assert_non_ascii("h\u{2080}", 1, 0xe2);
}

// Underscore confusables

#[test]
fn fullwidth_low_line_is_not_underscore() {
    // U+FF3F FULLWIDTH LOW LINE
    assert_non_ascii("a\u{ff3f}b", 1, 0xef);
}

#[test]
fn modifier_letter_low_macron_is_not_underscore() {
    // U+02CD MODIFIER LETTER LOW MACRON
    assert_non_ascii("a\u{02cd}b", 1, 0xcb);
}

#[test]
fn combining_low_line_is_not_underscore() {
    // U+0332 COMBINING LOW LINE
    assert_non_ascii("a\u{0332}b", 1, 0xcc);
}

// Invisible and zero-width

#[test]
fn zero_width_joiner_is_rejected() {
    // U+200D ZERO WIDTH JOINER
    assert_non_ascii("al\u{200d}ice", 2, 0xe2);
}

#[test]
fn zero_width_non_joiner_is_rejected() {
    // U+200C ZERO WIDTH NON-JOINER
    assert_non_ascii("al\u{200c}ice", 2, 0xe2);
}

#[test]
fn zero_width_space_is_rejected() {
    // U+200B ZERO WIDTH SPACE
    assert_non_ascii("al\u{200b}ice", 2, 0xe2);
}

#[test]
fn word_joiner_is_rejected() {
    // U+2060 WORD JOINER
    assert_non_ascii("a\u{2060}b", 1, 0xe2);
}

#[test]
fn soft_hyphen_is_rejected() {
    // U+00AD SOFT HYPHEN
    assert_non_ascii("al\u{00ad}ice", 2, 0xc2);
}

#[test]
fn left_to_right_mark_is_rejected() {
    // U+200E LEFT-TO-RIGHT MARK
    assert_non_ascii("\u{200e}alice", 0, 0xe2);
}

#[test]
fn right_to_left_override_is_rejected() {
    // U+202E RIGHT-TO-LEFT OVERRIDE
    assert_non_ascii("ali\u{202e}ce", 3, 0xe2);
}

#[test]
fn zero_width_no_break_space_bom_is_rejected() {
    // U+FEFF ZERO WIDTH NO-BREAK SPACE (BOM)
    assert_non_ascii("\u{feff}alice", 0, 0xef);
}

// Emoji and pictographs

#[test]
fn smiley_emoji_is_rejected() {
    // U+1F600 GRINNING FACE
    assert_non_ascii("\u{1f600}", 0, 0xf0);
}

#[test]
fn emoji_after_ascii_prefix_reports_correct_offset() {
    assert_non_ascii("abc\u{1f600}", 3, 0xf0);
}

#[test]
fn e_with_acute_is_rejected() {
    // U+00E9 LATIN SMALL LETTER E WITH ACUTE
    assert_non_ascii("al\u{00e9}ce", 2, 0xc3);
}

// Mixed ASCII + confusable: exact offset checks

#[test]
fn confusable_at_index_1_reports_index_1() {
    assert_non_ascii("a\u{0430}ice", 1, 0xd0);
}

#[test]
fn confusable_at_index_2_reports_index_2() {
    assert_non_ascii("al\u{0430}ce", 2, 0xd0);
}

#[test]
fn confusable_at_end_reports_last_index() {
    assert_non_ascii("alice\u{0430}", 5, 0xd0);
}

#[test]
fn at_prefix_then_confusable_reports_index_1() {
    // ASCII gate runs before @ stripping, offset 1 is still reported
    assert_non_ascii("@\u{0430}lice", 1, 0xd0);
}

#[test]
fn whitespace_prefix_then_confusable_reports_original_offset() {
    assert_non_ascii("  \u{0430}lice", 2, 0xd0);
}

#[test]
fn confusable_inside_tag_at_limit_is_caught() {
    use std::string::String as StdString;
    // 28 ASCII bytes + Cyrillic (starts at offset 28)
    let mut tag = StdString::from("alice_confusable_tag_test_he");
    tag.push('\u{0430}');
    tag.push('x');
    assert!(
        matches!(
            TagName::parse(&tag),
            Err(TagNameError::NonAscii { index: 28, .. })
        ),
        "confusable inside long tag must be caught at the correct offset"
    );
}

// Canonical ASCII tags are unaffected

#[test]
fn valid_ascii_tags_still_normalize_correctly() {
    for raw in ["alice", "alice99", "a_l_i_c_e", "z", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] {
        assert!(
            TagName::parse(raw).is_ok(),
            "valid ASCII tag {raw:?} must not be rejected"
        );
    }
}
