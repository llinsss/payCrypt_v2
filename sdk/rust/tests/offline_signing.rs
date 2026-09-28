//! Offline signing examples and tests for the Rust SDK (Soroban migration).
//!
//! This module demonstrates how to build, sign, serialize, and verify a
//! Soroban transaction entirely offline, without any network access. It also
//! exercises the typed error classification and cancellation semantics that
//! the SDK exposes for offline signing flows.
//!
//! The examples are intentionally self-contained so they can be copied into
//! downstream crates. The tests cover success, boundary, unauthorized, replay,
//! and failure paths as required by issue #846.

use std::collections::HashSet;
use std::fmt;

/// Deterministic, typed error classification for offline signing.
///
/// Every failure mode an offline signer can encounter maps to exactly one
/// variant so callers can branch on it without string matching.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OfflineSigningError {
    /// The caller is not authorized to sign for the given account.
    Unauthorized { account: String },
    /// The transaction nonce/sequence was already used (replay attempt).
    Replay { sequence: u64 },
    /// The input could not be parsed or is structurally invalid.
    MalformedInput { reason: String },
    /// A transport/network error occurred (should not happen offline).
    Transport { reason: String },
    /// The signing operation was cancelled by the caller.
    Cancelled,
}

impl fmt::Display for OfflineSigningError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OfflineSigningError::Unauthorized { account } => {
                write!(f, "unauthorized signer for account {account}")
            }
            OfflineSigningError::Replay { sequence } => {
                write!(f, "replay detected for sequence {sequence}")
            }
            OfflineSigningError::MalformedInput { reason } => {
                write!(f, "malformed input: {reason}")
            }
            OfflineSigningError::Transport { reason } => {
                write!(f, "transport error: {reason}")
            }
            OfflineSigningError::Cancelled => write!(f, "signing cancelled"),
        }
    }
}

impl std::error::Error for OfflineSigningError {}

/// A minimal, deterministic representation of a Soroban transaction envelope.
///
/// In a real SDK this would wrap `stellar_xdr::TransactionEnvelope`; here we
/// keep a typed, serializable shape so the offline signing flow is testable
/// without pulling in the full XDR stack.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransactionEnvelope {
    pub source_account: String,
    pub sequence: u64,
    pub network_passphrase: String,
    pub payload: Vec<u8>,
    pub signatures: Vec<Signature>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Signature {
    pub signer: String,
    pub bytes: Vec<u8>,
}

/// A signer that can authorize a transaction offline.
#[derive(Debug, Clone)]
pub struct OfflineSigner {
    pub account: String,
    pub secret: Vec<u8>,
}

/// Tracks sequence numbers already observed to reject replays deterministically.
#[derive(Debug, Default)]
pub struct ReplayGuard {
    seen: HashSet<u64>,
}

impl ReplayGuard {
    pub fn new() -> Self {
        Self::default()
    }

    /// Records a sequence number, returning `Err(Replay)` if it was already used.
    pub fn check_and_record(&mut self, sequence: u64) -> Result<(), OfflineSigningError> {
        if !self.seen.insert(sequence) {
            return Err(OfflineSigningError::Replay { sequence });
        }
        Ok(())
    }
}

/// Cooperative cancellation token for long-running signing operations.
#[derive(Debug, Clone, Default)]
pub struct CancellationToken {
    cancelled: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl CancellationToken {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn cancel(&self) {
        self.cancelled
            .store(true, std::sync::atomic::Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(std::sync::atomic::Ordering::SeqCst)
    }
}

/// Builds a deterministic transaction envelope for offline signing.
///
/// Validation is deterministic: the same inputs always produce the same
/// envelope or the same typed error.
pub fn build_envelope(
    source_account: &str,
    sequence: u64,
    network_passphrase: &str,
    payload: &[u8],
) -> Result<TransactionEnvelope, OfflineSigningError> {
    if source_account.is_empty() {
        return Err(OfflineSigningError::MalformedInput {
            reason: "source account must not be empty".into(),
        });
    }
    if network_passphrase.is_empty() {
        return Err(OfflineSigningError::MalformedInput {
            reason: "network passphrase must not be empty".into(),
        });
    }
    if payload.is_empty() {
        return Err(OfflineSigningError::MalformedInput {
            reason: "payload must not be empty".into(),
        });
    }
    Ok(TransactionEnvelope {
        source_account: source_account.to_string(),
        sequence,
        network_passphrase: network_passphrase.to_string(),
        payload: payload.to_vec(),
        signatures: Vec::new(),
    })
}

/// Signs an envelope offline, enforcing authorization, replay protection, and
/// cancellation. The signature is a deterministic function of the signer
/// secret and the envelope contents so tests are reproducible.
pub fn sign_offline(
    envelope: &mut TransactionEnvelope,
    signer: &OfflineSigner,
    guard: &mut ReplayGuard,
    token: &CancellationToken,
) -> Result<(), OfflineSigningError> {
    if token.is_cancelled() {
        return Err(OfflineSigningError::Cancelled);
    }
    if signer.account != envelope.source_account {
        return Err(OfflineSigningError::Unauthorized {
            account: signer.account.clone(),
        });
    }
    guard.check_and_record(envelope.sequence)?;

    let mut bytes = signer.secret.clone();
    bytes.extend_from_slice(&envelope.sequence.to_le_bytes());
    bytes.extend_from_slice(&envelope.payload);
    envelope.signatures.push(Signature {
        signer: signer.account.clone(),
        bytes,
    });
    Ok(())
}

/// Serializes an envelope to a deterministic byte representation.
pub fn serialize_envelope(envelope: &TransactionEnvelope) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(envelope.source_account.as_bytes());
    out.push(0);
    out.extend_from_slice(&envelope.sequence.to_le_bytes());
    out.extend_from_slice(envelope.network_passphrase.as_bytes());
    out.push(0);
    out.extend_from_slice(&envelope.payload);
    for sig in &envelope.signatures {
        out.extend_from_slice(sig.signer.as_bytes());
        out.push(0);
        out.extend_from_slice(&sig.bytes);
    }
    out
}

/// Verifies that an envelope carries at least one signature from the expected
/// signer. Verification is offline and deterministic.
pub fn verify_envelope(
    envelope: &TransactionEnvelope,
    expected_signer: &str,
) -> Result<(), OfflineSigningError> {
    if envelope.signatures.is_empty() {
        return Err(OfflineSigningError::MalformedInput {
            reason: "envelope has no signatures".into(),
        });
    }
    if !envelope
        .signatures
        .iter()
        .any(|s| s.signer == expected_signer)
    {
        return Err(OfflineSigningError::Unauthorized {
            account: expected_signer.to_string(),
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const PASSPHRASE: &str = "Test SDF Network ; September 2015";

    fn signer() -> OfflineSigner {
        OfflineSigner {
            account: "GABCDEF".into(),
            secret: vec![1, 2, 3, 4],
        }
    }

    #[test]
    fn success_path_builds_signs_serializes_and_verifies() {
        let mut env = build_envelope("GABCDEF", 1, PASSPHRASE, b"invoke").unwrap();
        let mut guard = ReplayGuard::new();
        let token = CancellationToken::new();

        sign_offline(&mut env, &signer(), &mut guard, &token).unwrap();
        let bytes = serialize_envelope(&env);
        assert!(!bytes.is_empty());
        verify_envelope(&env, "GABCDEF").unwrap();
    }

    #[test]
    fn boundary_empty_payload_is_rejected() {
        let err = build_envelope("GABCDEF", 1, PASSPHRASE, b"").unwrap_err();
        assert!(matches!(err, OfflineSigningError::MalformedInput { .. }));
    }

    #[test]
    fn boundary_empty_account_is_rejected() {
        let err = build_envelope("", 1, PASSPHRASE, b"x").unwrap_err();
        assert!(matches!(err, OfflineSigningError::MalformedInput { .. }));
    }

    #[test]
    fn unauthorized_signer_is_rejected() {
        let mut env = build_envelope("GABCDEF", 1, PASSPHRASE, b"invoke").unwrap();
        let mut guard = ReplayGuard::new();
        let token = CancellationToken::new();
        let other = OfflineSigner {
            account: "GOTHER".into(),
            secret: vec![9],
        };
        let err = sign_offline(&mut env, &other, &mut guard, &token).unwrap_err();
        assert_eq!(
            err,
            OfflineSigningError::Unauthorized {
                account: "GOTHER".into()
            }
        );
    }

    #[test]
    fn replay_is_rejected() {
        let mut guard = ReplayGuard::new();
        let token = CancellationToken::new();
        let mut env = build_envelope("GABCDEF", 7, PASSPHRASE, b"invoke").unwrap();
        sign_offline(&mut env, &signer(), &mut guard, &token).unwrap();

        let mut replay = build_envelope("GABCDEF", 7, PASSPHRASE, b"invoke").unwrap();
        let err = sign_offline(&mut replay, &signer(), &mut guard, &token).unwrap_err();
        assert_eq!(err, OfflineSigningError::Replay { sequence: 7 });
    }

    #[test]
    fn cancellation_is_reported() {
        let mut env = build_envelope("GABCDEF", 1, PASSPHRASE, b"invoke").unwrap();
        let mut guard = ReplayGuard::new();
        let token = CancellationToken::new();
        token.cancel();
        let err = sign_offline(&mut env, &signer(), &mut guard, &token).unwrap_err();
        assert_eq!(err, OfflineSigningError::Cancelled);
    }

    #[test]
    fn verify_without_signature_fails() {
        let env = build_envelope("GABCDEF", 1, PASSPHRASE, b"invoke").unwrap();
        let err = verify_envelope(&env, "GABCDEF").unwrap_err();
        assert!(matches!(err, OfflineSigningError::MalformedInput { .. }));
    }

    #[test]
    fn serialization_is_deterministic() {
        let mut a = build_envelope("GABCDEF", 3, PASSPHRASE, b"invoke").unwrap();
        let mut b = build_envelope("GABCDEF", 3, PASSPHRASE, b"invoke").unwrap();
        let mut guard = ReplayGuard::new();
        let token = CancellationToken::new();
        sign_offline(&mut a, &signer(), &mut guard, &token).unwrap();
        sign_offline(&mut b, &signer(), &mut guard, &token).unwrap();
        assert_eq!(serialize_envelope(&a), serialize_envelope(&b));
    }
}
