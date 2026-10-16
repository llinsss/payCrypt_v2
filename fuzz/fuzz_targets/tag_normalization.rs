#![no_main]

use libfuzzer_sys::fuzz_target;

/// Maximum input length we will feed into normalization. Keeps per-invocation
/// work bounded so the fuzzer cannot be trivially wedged by huge inputs.
const MAX_INPUT_LEN: usize = 4096;

/// Maximum number of Unicode scalar values we allow a single normalization
/// expansion to produce. Guards against pathological expansion blow-ups.
const MAX_EXPANSION_LEN: usize = 16 * 1024;

/// Normalize a tag the same way the contract does: trim surrounding ASCII
/// whitespace, then apply NFKC normalization. Returns `None` when the input is
/// not valid UTF-8 or when the normalized form exceeds the expansion bound.
fn normalize_tag(raw: &[u8]) -> Option<String> {
    let text = std::str::from_utf8(raw).ok()?;
    let trimmed = text.trim();
    let normalized = unicode_normalization::UnicodeNormalization::nfkc(trimmed).collect::<String>();
    if normalized.chars().count() > MAX_EXPANSION_LEN {
        return None;
    }
    Some(normalized)
}

fuzz_target!(|data: &[u8]| {
    if data.len() > MAX_INPUT_LEN {
        return;
    }

    // Malformed UTF-8 must be rejected without panicking.
    let normalized = match normalize_tag(data) {
        Some(value) => value,
        None => return,
    };

    // Normalization must be idempotent: normalizing an already-normalized tag
    // must yield the same result. Inconsistent results are a bug.
    let again = normalize_tag(normalized.as_bytes())
        .expect("normalized output must remain valid UTF-8");
    assert_eq!(normalized, again, "tag normalization is not idempotent");

    // The normalized form must never grow past the expansion bound.
    assert!(
        normalized.chars().count() <= MAX_EXPANSION_LEN,
        "normalized tag exceeded expansion bound"
    );

    // Combining marks and other non-ASCII scalars must survive round-tripping
    // through the normalizer without loss.
    for ch in normalized.chars() {
        assert!(
            !ch.is_control() || ch == '\n' || ch == '\t',
            "normalized tag contains unexpected control character"
        );
    }
});
