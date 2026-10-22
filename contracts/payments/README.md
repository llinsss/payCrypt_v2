# Payments Contract (Soroban / Rust)

Soroban port of the payments contract. This document covers the bounded
metadata model for payments (issue #778): storage layout, validation rules,
authorization, events, errors, resource limits, and upgrade/rollback notes.

## Bounded metadata model

Each payment may carry an optional, bounded key/value metadata map. The model
is intentionally small so that a single payment's footprint stays within
Soroban ledger-entry and CPU/memory limits.

### Limits

| Limit | Value | Rationale |
| --- | --- | --- |
| `MAX_METADATA_ENTRIES` | 16 | Caps the number of keys per payment. |
| `MAX_METADATA_KEY_LEN` | 32 bytes | Keys are short, namespaced identifiers. |
| `MAX_METADATA_VALUE_LEN` | 128 bytes | Values are short strings/opaque bytes. |
| `MAX_METADATA_TOTAL_BYTES` | 1024 bytes | Sum of key+value bytes across all entries. |

All limits are enforced deterministically at write time; reads never fail on
size because stored data was validated on write.

### Storage

Metadata is stored alongside the payment record under a dedicated key so it can
be read/updated independently and does not bloat the core payment entry:

```rust
// Persistent storage keyed by payment id.
#[contracttype]
pub struct PaymentMetadata {
    pub entries: Vec<(Symbol, Bytes)>, // canonical order: sorted by key
}
```

- Entries are stored in **canonical order** (ascending by key) so that the
  serialized footprint and emitted events are deterministic.
- Duplicate keys are rejected; updates replace the value in place.
- An empty metadata map is represented by the absence of the storage entry
  (no empty `Vec` is persisted).

### Validation

`validate_metadata` runs before any write and returns a typed error on the
first violation:

1. `entries.len() <= MAX_METADATA_ENTRIES`
2. each `key.len() <= MAX_METADATA_KEY_LEN`
3. each `value.len() <= MAX_METADATA_VALUE_LEN`
4. `sum(key.len() + value.len()) <= MAX_METADATA_TOTAL_BYTES`
5. keys are unique
6. keys are sorted ascending (canonical ordering)

Validation is pure and deterministic: the same input always yields the same
result, independent of host state.

### Authorization

- Only the payment's payer/owner (or an explicitly authorized operator) may
  write metadata. The contract calls `require_auth` on the authorizing address
  before mutating storage.
- Unauthorized writes fail with `Error::Unauthorized` and leave storage
  unchanged (no partial writes).

### Events

Every successful mutation emits a typed event:

```
("payment_meta", "set")   -> (payment_id, key, value_len)
("payment_meta", "remove") -> (payment_id, key)
```

Events carry only bounded fields (ids, keys, lengths) — never full values — to
keep event size within limits.

### Errors

```rust
pub enum Error {
    Unauthorized = 1,
    TooManyMetadataEntries = 2,
    MetadataKeyTooLong = 3,
    MetadataValueTooLong = 4,
    MetadataTooLarge = 5,
    DuplicateMetadataKey = 6,
    MetadataNotSorted = 7,
    PaymentNotFound = 8,
}
```

### Resource limits

- Bounded entry count and byte caps keep the metadata ledger entry well under
  the per-entry size limit.
- Canonical ordering avoids re-sorting on read and keeps CPU cost linear.
- Writes touch at most one metadata entry plus the payment entry, keeping the
  read/write footprint predictable for fee estimation.

### Tests

Unit and property tests cover:

- **Success**: valid metadata round-trips and is stored in canonical order.
- **Boundary**: exactly-at-limit entry count, key/value lengths, and total bytes.
- **Unauthorized**: non-owner write is rejected and storage is unchanged.
- **Replay**: re-applying the same metadata write is idempotent (no duplicate
  entries, same canonical result).
- **Failure**: over-limit, duplicate key, and unsorted input return the
  corresponding typed error.

Local-network tests exercise the full write path (auth + event emission) against
`soroban testutils` / a local network.

### Migration, indexing, monitoring, rollback

- **Migration**: metadata is a new, optional storage entry. Existing payments
  without metadata read as empty; no backfill is required. New writes populate
  the entry lazily.
- **Indexing**: indexers should consume `payment_meta` events and key on
  `payment_id`; values are fetched on demand from storage rather than from
  events.
- **Monitoring**: alert on spikes in `Unauthorized` and size-limit errors, which
  indicate client bugs or abuse attempts.
- **Rollback**: because metadata is isolated in its own entry, disabling
  metadata writes (feature flag / contract upgrade) leaves core payment data
  intact; the entry can be ignored or cleared without affecting payments.
