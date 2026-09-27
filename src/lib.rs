//! Secure signer abstraction for Rust deployments.
//!
//! This module separates the distinct key roles used by deployments:
//! read-only clients, user signers, deployer keys, admin keys, and relayer
//! keys. Signer material is only ever loaded from secure sources (environment
//! variables or a secret-manager backend) and is never accepted through
//! request payloads. All `Debug`/`Display` output is redacted so keys and
//! signed payloads never leak into logs.

use std::fmt;

/// Placeholder for a signed payload produced by a [`Signer`].
///
/// The inner bytes are intentionally opaque and redacted in all formatting
/// output so signed payloads are never written to logs.
#[derive(Clone, PartialEq, Eq)]
pub struct SignedPayload {
    bytes: Vec<u8>,
}

impl SignedPayload {
    /// Wrap raw signed bytes.
    pub fn new(bytes: impl Into<Vec<u8>>) -> Self {
        Self {
            bytes: bytes.into(),
        }
    }

    /// Borrow the raw signed bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }
}

impl fmt::Debug for SignedPayload {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SignedPayload")
            .field("bytes", &"<redacted>")
            .finish()
    }
}

impl fmt::Display for SignedPayload {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("SignedPayload(<redacted>)")
    }
}

/// Errors produced while loading or using signers.
#[derive(Debug)]
pub enum SignerError {
    /// The requested signer material was not present in the secure source.
    MissingSecret(String),
    /// The secret-manager backend could not be reached or returned an error.
    SecretManager(String),
    /// The signer material was present but malformed.
    InvalidSecret(String),
}

impl fmt::Display for SignerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SignerError::MissingSecret(name) => {
                write!(f, "missing secret for signer: {name}")
            }
            SignerError::SecretManager(msg) => write!(f, "secret manager error: {msg}"),
            SignerError::InvalidSecret(name) => {
                write!(f, "invalid secret for signer: {name}")
            }
        }
    }
}

impl std::error::Error for SignerError {}

/// Secure source of signer material.
///
/// Implementations must only read from trusted locations such as environment
/// variables or a secret-manager backend. Signer material must never be
/// supplied through request payloads.
pub trait SecretSource {
    /// Fetch the secret material for `name`.
    fn get(&self, name: &str) -> Result<String, SignerError>;
}

/// Reads signer material from environment variables.
///
/// The variable name is derived from the signer name so callers never pass
/// raw keys around.
pub struct EnvSecretSource;

impl EnvSecretSource {
    /// Environment variable prefix used for signer material.
    pub const PREFIX: &'static str = "SIGNER_";

    fn var_name(name: &str) -> String {
        format!("{}{}", Self::PREFIX, name.to_ascii_uppercase())
    }
}

impl SecretSource for EnvSecretSource {
    fn get(&self, name: &str) -> Result<String, SignerError> {
        let var = Self::var_name(name);
        std::env::var(&var).map_err(|_| SignerError::MissingSecret(var))
    }
}

/// Reads signer material from an external secret-manager backend.
///
/// The backend is abstracted so concrete integrations (Vault, KMS, cloud
/// secret managers, ...) can be plugged in without changing signer code.
pub trait SecretManager {
    /// Resolve the secret material for `name` from the backend.
    fn resolve(&self, name: &str) -> Result<String, SignerError>;
}

/// [`SecretSource`] backed by a [`SecretManager`].
pub struct SecretManagerSource<M: SecretManager> {
    manager: M,
}

impl<M: SecretManager> SecretManagerSource<M> {
    /// Build a source from a secret-manager backend.
    pub fn new(manager: M) -> Self {
        Self { manager }
    }
}

impl<M: SecretManager> SecretSource for SecretManagerSource<M> {
    fn get(&self, name: &str) -> Result<String, SignerError> {
        self.manager.resolve(name)
    }
}

/// Trait-based signer interface.
///
/// Each deployment role implements this trait. Signers are constructed from a
/// [`SecretSource`] only, so secret keys are never required in request
/// payloads and never logged.
pub trait Signer {
    /// The role this signer fulfils.
    fn role(&self) -> SignerRole;

    /// Sign `payload`, returning an opaque, redacted [`SignedPayload`].
    fn sign(&self, payload: &[u8]) -> Result<SignedPayload, SignerError>;
}

/// The distinct key roles used by deployments.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignerRole {
    /// Read-only client: no signing capability.
    ReadOnlyClient,
    /// End-user signer.
    User,
    /// Deployer key.
    Deployer,
    /// Admin key.
    Admin,
    /// Relayer key.
    Relayer,
}

impl SignerRole {
    /// Secret name used to load this role's material from a [`SecretSource`].
    pub fn secret_name(self) -> &'static str {
        match self {
            SignerRole::ReadOnlyClient => "read_only_client",
            SignerRole::User => "user",
            SignerRole::Deployer => "deployer",
            SignerRole::Admin => "admin",
            SignerRole::Relayer => "relayer",
        }
    }
}

/// A signer whose key material is loaded from a secure [`SecretSource`].
///
/// The key is held privately and is redacted in all formatting output.
pub struct KeySigner {
    role: SignerRole,
    key: String,
}

impl KeySigner {
    /// Load a signer for `role` from `source`.
    ///
    /// Returns [`SignerError::MissingSecret`] when the material is absent and
    /// [`SignerError::InvalidSecret`] when it is empty.
    pub fn from_source<S: SecretSource>(
        role: SignerRole,
        source: &S,
    ) -> Result<Self, SignerError> {
        let key = source.get(role.secret_name())?;
        if key.trim().is_empty() {
            return Err(SignerError::InvalidSecret(role.secret_name().to_string()));
        }
        Ok(Self { role, key })
    }
}

impl Signer for KeySigner {
    fn role(&self) -> SignerRole {
        self.role
    }

    fn sign(&self, payload: &[u8]) -> Result<SignedPayload, SignerError> {
        // Placeholder signing: combine the key with the payload. The concrete
        // cryptographic scheme is provided by the deployment backend.
        let mut bytes = Vec::with_capacity(self.key.len() + payload.len());
        bytes.extend_from_slice(self.key.as_bytes());
        bytes.extend_from_slice(payload);
        Ok(SignedPayload::new(bytes))
    }
}

impl fmt::Debug for KeySigner {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("KeySigner")
            .field("role", &self.role)
            .field("key", &"<redacted>")
            .finish()
    }
}

/// A read-only client that has no signing capability.
///
/// It is constructed without any secret material, so read-only deployments
/// never require keys.
#[derive(Debug, Default)]
pub struct ReadOnlyClient;

impl ReadOnlyClient {
    /// Create a read-only client.
    pub fn new() -> Self {
        Self
    }
}

impl Signer for ReadOnlyClient {
    fn role(&self) -> SignerRole {
        SignerRole::ReadOnlyClient
    }

    fn sign(&self, _payload: &[u8]) -> Result<SignedPayload, SignerError> {
        Err(SignerError::InvalidSecret(
            "read-only client cannot sign".to_string(),
        ))
    }
}

/// Redact a secret value for safe logging.
///
/// Only a short, non-reversible fingerprint is retained so operators can
/// correlate entries without exposing the secret itself.
pub fn redact(secret: &str) -> String {
    if secret.is_empty() {
        return "<redacted>".to_string();
    }
    let visible = secret.chars().count().min(4);
    let tail: String = secret.chars().rev().take(visible).collect();
    let tail: String = tail.chars().rev().collect();
    format!("<redacted:...{tail}>")
}

#[cfg(test)]
mod tests {
    use super::*;

    struct StaticSource(&'static str);

    impl SecretSource for StaticSource {
        fn get(&self, _name: &str) -> Result<String, SignerError> {
            Ok(self.0.to_string())
        }
    }

    #[test]
    fn key_signer_redacts_key_in_debug() {
        let signer = KeySigner::from_source(SignerRole::Deployer, &StaticSource("super-secret"))
            .expect("signer");
        let debug = format!("{signer:?}");
        assert!(!debug.contains("super-secret"));
        assert!(debug.contains("<redacted>"));
    }

    #[test]
    fn signed_payload_is_redacted() {
        let payload = SignedPayload::new(vec![1, 2, 3]);
        assert_eq!(format!("{payload:?}"), "SignedPayload { bytes: \"<redacted>\" }");
        assert_eq!(format!("{payload}"), "SignedPayload(<redacted>)");
    }

    #[test]
    fn read_only_client_cannot_sign() {
        let client = ReadOnlyClient::new();
        assert_eq!(client.role(), SignerRole::ReadOnlyClient);
        assert!(client.sign(b"payload").is_err());
    }

    #[test]
    fn redact_hides_secret_body() {
        let redacted = redact("abcdef123456");
        assert!(!redacted.contains("abcdef123456"));
        assert!(redacted.starts_with("<redacted"));
    }
}
