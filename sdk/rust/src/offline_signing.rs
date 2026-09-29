//! Offline signing examples for the Soroban Rust SDK.
//!
//! This module provides typed, deterministic building blocks for constructing,
//! signing, serializing and verifying Soroban transactions *without* a network
//! connection. It is intentionally self-contained so it can be used as a
//! reference for the Rust/Soroban migration and as a testable unit.
//!
//! # Design
//!
//! * [`OfflineSigner`] owns the signing key material and exposes a typed API to
//!   build, sign, serialize and verify transactions.
//! * [`SignedTransaction`] is the serializable artifact produced by signing.
//! * [`SigningError`] classifies every failure into an actionable variant so
//!   callers can react (retry, re-auth, surface to the user, ...).
//! * Cancellation is supported through [`CancellationToken`], which is checked
//!   before any expensive work and between signing steps.
//!
//! # Determinism
//!
//! Signing is deterministic: the same [`TransactionEnvelope`] and key always
//! produce the same [`SignedTransaction`]. Replay protection is enforced by a
//! monotonically increasing sequence number and a set of seen signatures.

use std::collections::HashSet;
use std::fmt;

/// A Soroban transaction envelope that is ready to be signed offline.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransactionEnvelope {
    /// Network passphrase the transaction is bound to (e.g. `"Test SDF Network ; September 2015"`).
    pub network_passphrase: String,
    /// Source account identifier (e.g. a `G...` strkey).
    pub source_account: String,
    /// Monotonically increasing sequence number used for replay protection.
    pub sequence: u64,
    /// Opaque, already-encoded Soroban operation payload.
    pub operation: Vec<u8>,
}

impl TransactionEnvelope {
    /// Creates a new envelope, validating the required fields.
    pub fn new(
        network_passphrase: impl Into<String>,
        source_account: impl Into<String>,
        sequence: u64,
        operation: Vec<u8>,
    ) -> Result<Self, SigningError> {
        let network_passphrase = network_passphrase.into();
        let source_account = source_account.into();

        if network_passphrase.trim().is_empty() {
            return Err(SigningError::MalformedInput(
                "network passphrase must not be empty".into(),
            ));
        }
        if source_account.trim().is_empty() {
            return Err(SigningError::MalformedInput(
                "source account must not be empty".into(),
            ));
        }
        if operation.is_empty() {
            return Err(SigningError::MalformedInput(
                "operation payload must not be empty".into(),
            ));
        }

        Ok(Self {
            network_passphrase,
            source_account,
            sequence,
            operation,
        })
    }

    /// Deterministic byte encoding used as the signing pre-image.
    pub fn to_signing_payload(&self) -> Vec<u8> {
        let mut payload = Vec::with_capacity(
            self.network_passphrase.len() + self.source_account.len() + self.operation.len() + 16,
        );
        payload.extend_from_slice(self.network_passphrase.as_bytes());
        payload.push(0);
        payload.extend_from_slice(self.source_account.as_bytes());
        payload.push(0);
        payload.extend_from_slice(&self.sequence.to_be_bytes());
        payload.extend_from_slice(&self.operation);
        payload
    }
}

/// A signed transaction that can be serialized and submitted later.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SignedTransaction {
    /// The envelope that was signed.
    pub envelope: TransactionEnvelope,
    /// Deterministic signature over [`TransactionEnvelope::to_signing_payload`].
    pub signature: Vec<u8>,
}

impl SignedTransaction {
    /// Serializes the signed transaction into a stable, self-describing byte format.
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = Vec::new();
        out.extend_from_slice(b"SOROBAN-SIGNED-V1");
        out.push(0);
        out.extend_from_slice(&(self.envelope.network_passphrase.len() as u32).to_be_bytes());
        out.extend_from_slice(self.envelope.network_passphrase.as_bytes());
        out.extend_from_slice(&(self.envelope.source_account.len() as u32).to_be_bytes());
        out.extend_from_slice(self.envelope.source_account.as_bytes());
        out.extend_from_slice(&self.envelope.sequence.to_be_bytes());
        out.extend_from_slice(&(self.envelope.operation.len() as u32).to_be_bytes());
        out.extend_from_slice(&self.envelope.operation);
        out.extend_from_slice(&(self.signature.len() as u32).to_be_bytes());
        out.extend_from_slice(&self.signature);
        out
    }

    /// Deserializes a signed transaction produced by [`SignedTransaction::to_bytes`].
    pub fn from_bytes(bytes: &[u8]) -> Result<Self, SigningError> {
        const MAGIC: &[u8] = b"SOROBAN-SIGNED-V1";
        let mut cursor = 0usize;

        let read = |cursor: &mut usize, len: usize| -> Result<&[u8], SigningError> {
            let end = cursor
                .checked_add(len)
                .ok_or_else(|| SigningError::MalformedInput("length overflow".into()))?;
            if end > bytes.len() {
                return Err(SigningError::MalformedInput(
                    "unexpected end of input".into(),
                ));
            }
            let slice = &bytes[*cursor..end];
            *cursor = end;
            Ok(slice)
        };

        if read(&mut cursor, MAGIC.len())? != MAGIC {
            return Err(SigningError::MalformedInput("invalid magic header".into()));
        }
        read(&mut cursor, 1)?; // separator

        let net_len = u32::from_be_bytes(read(&mut cursor, 4)?.try_into().unwrap()) as usize;
        let network_passphrase = String::from_utf8(read(&mut cursor, net_len)?.to_vec())
            .map_err(|_| SigningError::MalformedInput("network passphrase is not utf-8".into()))?;

        let acct_len = u32::from_be_bytes(read(&mut cursor, 4)?.try_into().unwrap()) as usize;
        let source_account = String::from_utf8(read(&mut cursor, acct_len)?.to_vec())
            .map_err(|_| SigningError::MalformedInput("source account is not utf-8".into()))?;

        let sequence = u64::from_be_bytes(read(&mut cursor, 8)?.try_into().unwrap());

        let op_len = u32::from_be_bytes(read(&mut cursor, 4)?.try_into().unwrap()) as usize;
        let operation = read(&mut cursor, op_len)?.to_vec();

        let sig_len = u32::from_be_bytes(read(&mut cursor, 4)?.try_into().unwrap()) as usize;
        let signature = read(&mut cursor, sig_len)?.to_vec();

        if cursor != bytes.len() {
            return Err(SigningError::MalformedInput(
                "trailing bytes after signed transaction".into(),
            ));
        }

        let envelope = TransactionEnvelope::new(network_passphrase, source_account, sequence, operation)?;
        Ok(Self { envelope, signature })
    }
}

/// Cooperative cancellation token for long-running signing operations.
#[derive(Debug, Clone, Default)]
pub struct CancellationToken {
    cancelled: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl CancellationToken {
    /// Creates a fresh, non-cancelled token.
    pub fn new() -> Self {
        Self::default()
    }

    /// Requests cancellation. Safe to call from any thread.
    pub fn cancel(&self) {
        self.cancelled
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }

    /// Returns `true` if cancellation has been requested.
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Returns [`SigningError::Cancelled`] if cancellation was requested.
    pub fn check(&self) -> Result<(), SigningError> {
        if self.is_cancelled() {
            Err(SigningError::Cancelled)
        } else {
            Ok(())
        }
    }
}

/// Actionable classification of every offline-signing failure.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SigningError {
    /// The caller supplied structurally invalid input.
    MalformedInput(String),
    /// The signing key is not authorized for the requested operation.
    Unauthorized(String),
    /// The transaction sequence was already used (replay attempt).
    Replay { sequence: u64 },
    /// The operation was cancelled before completion.
    Cancelled,
    /// A transport/network error occurred while submitting.
    Transport(String),
    /// The signature did not verify against the envelope.
    InvalidSignature,
}

impl fmt::Display for SigningError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SigningError::MalformedInput(msg) => write!(f, "malformed input: {msg}"),
            SigningError::Unauthorized(msg) => write!(f, "unauthorized: {msg}"),
            SigningError::Replay { sequence } => {
                write!(f, "replay detected for sequence {sequence}")
            }
            SigningError::Cancelled => write!(f, "signing operation was cancelled"),
            SigningError::Transport(msg) => write!(f, "transport error: {msg}"),
            SigningError::InvalidSignature => write!(f, "signature verification failed"),
        }
    }
}

impl std::error::Error for SigningError {}

/// A deterministic, offline signer.
///
/// The signer keeps a set of already-seen sequence numbers to reject replays and
/// a set of authorized source accounts to reject unauthorized requests.
#[derive(Debug, Default)]
pub struct OfflineSigner {
    key: Vec<u8>,
    authorized_accounts: HashSet<String>,
    seen_sequences: HashSet<u64>,
}

impl OfflineSigner {
    /// Creates a signer from raw key material.
    pub fn new(key: Vec<u8>) -> Result<Self, SigningError> {
        if key.is_empty() {
            return Err(SigningError::MalformedInput("signing key must not be empty".into()));
        }
        Ok(Self {
            key,
            authorized_accounts: HashSet::new(),
            seen_sequences: HashSet::new(),
        })
    }

    /// Authorizes a source account to be signed for.
    pub fn authorize(&mut self, account: impl Into<String>) {
        self.authorized_accounts.insert(account.into());
    }

    /// Deterministic signature over the envelope's signing payload.
    fn sign_payload(&self, payload: &[u8]) -> Vec<u8> {
        // A simple, deterministic keyed digest. This is a reference implementation
        // for offline signing examples, not a production cryptographic primitive.
        let mut out = Vec::with_capacity(32);
        let mut acc: u64 = 0xcbf2_9ce4_8422_2325;
        for (i, byte) in payload.iter().enumerate() {
            let k = self.key[i % self.key.len()];
            acc ^= (*byte as u64) ^ (k as u64);
            acc = acc.wrapping_mul(0x0000_0100_0000_01b3);
        }
        for _ in 0..4 {
            out.extend_from_slice(&acc.to_be_bytes());
            acc = acc.wrapping_mul(0x0000_0100_0000_01b3).wrapping_add(1);
        }
        out
    }

    /// Builds, signs and returns a [`SignedTransaction`] for the given envelope.
    ///
    /// Cancellation is checked before signing and again before returning.
    pub fn sign(
        &mut self,
        envelope: TransactionEnvelope,
        token: &CancellationToken,
    ) -> Result<SignedTransaction, SigningError> {
        token.check()?;

        if !self.authorized_accounts.contains(&envelope.source_account) {
            return Err(SigningError::Unauthorized(format!(
                "account {} is not authorized to sign",
                envelope.source_account
            )));
        }

        if self.seen_sequences.contains(&envelope.sequence) {
            return Err(SigningError::Replay {
                sequence: envelope.sequence,
            });
        }

        let payload = envelope.to_signing_payload();
        let signature = self.sign_payload(&payload);

        token.check()?;

        self.seen_sequences.insert(envelope.sequence);
        Ok(SignedTransaction {
            envelope,
            signature,
        })
    }

    /// Verifies that a signed transaction was produced by this signer.
    pub fn verify(&self, signed: &SignedTransaction) -> Result<(), SigningError> {
        let expected = self.sign_payload(&signed.envelope.to_signing_payload());
        if expected == signed.signature {
            Ok(())
        } else {
            Err(SigningError::InvalidSignature)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn envelope(sequence: u64) -> TransactionEnvelope {
        TransactionEnvelope::new(
            "Test SDF Network ; September 2015",
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            sequence,
            vec![1, 2, 3, 4],
        )
        .expect("valid envelope")
    }

    fn signer() -> OfflineSigner {
        let mut signer = OfflineSigner::new(vec![7u8; 32]).expect("valid key");
        signer.authorize("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF");
        signer
    }

    #[test]
    fn signs_and_verifies_successfully() {
        let mut signer = signer();
        let token = CancellationToken::new();
        let signed = signer.sign(envelope(1), &token).expect("signs");
        assert!(signer.verify(&signed).is_ok());
    }

    #[test]
    fn signing_is_deterministic() {
        let mut a = signer();
        let mut b = signer();
        let token = CancellationToken::new();
        let sa = a.sign(envelope(1), &token).unwrap();
        let sb = b.sign(envelope(1), &token).unwrap();
        assert_eq!(sa.signature, sb.signature);
    }

    #[test]
    fn rejects_empty_operation() {
        let err = TransactionEnvelope::new("net", "acct", 1, vec![]).unwrap_err();
        assert!(matches!(err, SigningError::MalformedInput(_)));
    }

    #[test]
    fn rejects_unauthorized_account() {
        let mut signer = OfflineSigner::new(vec![1u8; 32]).unwrap();
        let token = CancellationToken::new();
        let err = signer.sign(envelope(1), &token).unwrap_err();
        assert!(matches!(err, SigningError::Unauthorized(_)));
    }

    #[test]
    fn rejects_replay() {
        let mut signer = signer();
        let token = CancellationToken::new();
        signer.sign(envelope(5), &token).unwrap();
        let err = signer.sign(envelope(5), &token).unwrap_err();
        assert_eq!(err, SigningError::Replay { sequence: 5 });
    }

    #[test]
    fn cancellation_is_honored() {
        let mut signer = signer();
        let token = CancellationToken::new();
        token.cancel();
        let err = signer.sign(envelope(1), &token).unwrap_err();
        assert_eq!(err, SigningError::Cancelled);
    }

    #[test]
    fn round_trips_serialization() {
        let mut signer = signer();
        let token = CancellationToken::new();
        let signed = signer.sign(envelope(9), &token).unwrap();
        let bytes = signed.to_bytes();
        let decoded = SignedTransaction::from_bytes(&bytes).unwrap();
        assert_eq!(signed, decoded);
    }

    #[test]
    fn rejects_tampered_signature() {
        let mut signer = signer();
        let token = CancellationToken::new();
        let mut signed = signer.sign(envelope(3), &token).unwrap();
        signed.signature[0] ^= 0xff;
        assert_eq!(signer.verify(&signed), Err(SigningError::InvalidSignature));
    }

    #[test]
    fn rejects_malformed_bytes() {
        let err = SignedTransaction::from_bytes(b"not-a-signed-tx").unwrap_err();
        assert!(matches!(err, SigningError::MalformedInput(_)));
    }

    #[test]
    fn boundary_sequence_zero_is_valid() {
        let mut signer = signer();
        let token = CancellationToken::new();
        assert!(signer.sign(envelope(0), &token).is_ok());
    }
}
