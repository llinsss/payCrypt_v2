# Rust SDK

Typed Rust SDK for building, signing, and submitting Soroban transactions.

## Offline signing

The SDK supports fully offline signing: a transaction can be built and signed
without any network access, then serialized and submitted later. This is useful
for air-gapped signers, hardware wallets, and multi-party approval flows.

### Building and signing offline

```rust
use soroban_sdk::{Env, Transaction, SigningKey};

// Build a transaction envelope without touching the network.
let env = Env::default();
let tx = Transaction::builder()
    .source_account(&source)
    .fee(100)
    .sequence_number(seq)
    .operation(op)
    .build()?;

// Sign with a local key. No RPC client is required.
let signed = tx.sign(&SigningKey::from_secret(secret))?;

// Serialize to XDR for transport or storage.
let xdr = signed.to_xdr()?;
```

### Verifying a signed transaction

```rust
let signed = Transaction::from_xdr(&xdr)?;

// Deterministic validation: signature, sequence, and fee bounds.
signed.verify()?;
```

### Cancellation

Signing operations accept a cancellation token so long-running or
user-initiated flows can be aborted deterministically:

```rust
use soroban_sdk::CancellationToken;

let token = CancellationToken::new();
let signed = tx.sign_with_cancellation(&key, &token)?;
// token.cancel() from another task aborts the operation.
```

### Error classification

All fallible operations return a typed `SigningError` so callers can react
programmatically instead of matching on strings:

| Variant | Meaning |
| --- | --- |
| `SigningError::Unauthorized` | Missing or invalid signing key / signature. |
| `SigningError::Replay` | Sequence number already used or stale. |
| `SigningError::Malformed` | Invalid XDR or malformed transaction input. |
| `SigningError::Transport` | Network/RPC failure during submission. |
| `SigningError::Cancelled` | Operation aborted via cancellation token. |

```rust
match tx.sign(&key) {
    Ok(signed) => submit(signed),
    Err(SigningError::Unauthorized) => request_credentials(),
    Err(SigningError::Replay) => refresh_sequence(),
    Err(SigningError::Cancelled) => log::info!("signing cancelled"),
    Err(e) => return Err(e.into()),
}
```

## Testing

Tests cover success, boundary, unauthorized, replay, and failure paths:

- Unit tests for build/sign/serialize/verify round-trips.
- Property tests asserting deterministic serialization and validation.
- Local-network tests exercising submission and replay rejection.

```sh
cargo test -p soroban-sdk
```

## Migration, indexing, monitoring, and rollback

- **Migration**: existing callers using the untyped signing helpers should
  migrate to the typed `Transaction` builder and `SigningError` variants.
  Behavior is unchanged for successful paths.
- **Indexing**: signed XDR envelopes are stable and can be indexed by
  transaction hash; the serialization format is deterministic.
- **Monitoring**: emit metrics on each `SigningError` variant to distinguish
  unauthorized, replay, and transport failures in production.
- **Rollback**: the typed API is additive; reverting to the previous release
  restores the untyped helpers without data migration.
