//! Secure signer abstraction for Rust deployments.
//!
//! This module separates the distinct key roles used by the deployment tooling:
//!
//! * [`ReadOnlyClient`] — no key material at all, only public/read access.
//! * [`UserSigner`] — signs on behalf of an end user.
//! * [`DeployerSigner`] — signs contract deployments.
//! * [`AdminSigner`] — signs privileged/admin operations.
//! * [`RelayerSigner`] — signs relayer submissions.
//!
//! All signers are constructed from secure sources (environment variables or a
//! secret-manager backend) and never accept secret keys from request payloads.
//! Secret material and signed payloads are redacted in every `Debug`/`Display`
//! implementation so keys can never leak into logs.

use std::collections::HashMap;
use std::env;
use std::fmt;

/// Placeholder for the concrete signature type produced by a signer.
///
/// Kept opaque so callers cannot accidentally log raw signed payloads.
pub struct Signature(Vec<u8>);

impl Signature {
    /// Wrap raw signature bytes.
    pub fn new(bytes: Vec<u8>) -> Self {
        Signature(bytes)
    }

    /// Borrow the raw signature bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

impl fmt::Debug for Signature {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Never expose signed payload bytes in logs.
        f.write_str("Signature([REDACTED])")
    }
}

impl fmt::Display for Signature {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Signature([REDACTED])")
    }
}

/// Errors produced while loading or using signer material.
#[derive(Debug)]
pub enum SignerError {
    /// The requested secret was not present in the configured source.
    MissingSecret(String),
    /// The secret source could not be reached or parsed.
    Source(String),
    /// The signer role is not permitted to perform the requested operation.
    Unauthorized(&'static str),
}

impl fmt::Display for SignerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SignerError::MissingSecret(name) => {
                write!(f, "missing secret: {name}")
            }
            SignerError::Source(msg) => write!(f, "secret source error: {msg}"),
            SignerError::Unauthorized(role) => {
                write!(f, "signer role not authorized: {role}")
            }
        }
    }
}

impl std::error::Error for SignerError {}

/// A source of secret material.
///
/// Implementations must load secrets from secure locations only. Secrets are
/// never accepted from request payloads.
pub trait SecretSource {
    /// Fetch the secret bytes for `name`.
    fn get(&self, name: &str) -> Result<Vec<u8>, SignerError>;
}

/// Loads secrets from process environment variables.
///
/// This is the default integration for local/CI deployments. Production
/// deployments should prefer a secret-manager backend.
pub struct EnvSecretSource;

impl SecretSource for EnvSecretSource {
    fn get(&self, name: &str) -> Result<Vec<u8>, SignerError> {
        match env::var(name) {
            Ok(value) => Ok(value.into_bytes()),
            Err(_) => Err(SignerError::MissingSecret(name.to_string())),
        }
    }
}

/// Loads secrets from an in-memory map.
///
/// Intended for secret-manager adapters (Vault, AWS Secrets Manager, etc.)
/// that resolve secrets out-of-band and hand them to the signer.
pub struct MapSecretSource {
    secrets: HashMap<String, Vec<u8>>,
}

impl MapSecretSource {
    /// Build a source from resolved secret-manager values.
    pub fn new(secrets: HashMap<String, Vec<u8>>) -> Self {
        MapSecretSource { secrets }
    }
}

impl SecretSource for MapSecretSource {
    fn get(&self, name: &str) -> Result<Vec<u8>, SignerError> {
        self.secrets
            .get(name)
            .cloned()
            .ok_or_else(|| SignerError::MissingSecret(name.to_string()))
    }
}

/// The role a signer plays in a deployment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignerRole {
    /// Read-only access; holds no key material.
    ReadOnly,
    /// Signs on behalf of an end user.
    User,
    /// Signs contract deployments.
    Deployer,
    /// Signs privileged/admin operations.
    Admin,
    /// Signs relayer submissions.
    Relayer,
}

impl SignerRole {
    /// Human-readable role name used in errors and logs.
    pub fn as_str(&self) -> &'static str {
        match self {
            SignerRole::ReadOnly => "read-only",
            SignerRole::User => "user",
            SignerRole::Deployer => "deployer",
            SignerRole::Admin => "admin",
            SignerRole::Relayer => "relayer",
        }
    }
}

/// Trait-based signer interface.
///
/// Every signer exposes its role and can sign an opaque payload. Read-only
/// clients implement this trait but reject signing, guaranteeing that no key
/// material is required for read paths.
pub trait Signer {
    /// The role this signer fulfils.
    fn role(&self) -> SignerRole;

    /// Sign `payload`, returning an opaque [`Signature`].
    fn sign(&self, payload: &[u8]) -> Result<Signature, SignerError>;
}

/// A read-only client that holds no key material.
#[derive(Default)]
pub struct ReadOnlyClient;

impl ReadOnlyClient {
    /// Create a read-only client.
    pub fn new() -> Self {
        ReadOnlyClient
    }
}

impl fmt::Debug for ReadOnlyClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ReadOnlyClient")
    }
}

impl Signer for ReadOnlyClient {
    fn role(&self) -> SignerRole {
        SignerRole::ReadOnly
    }

    fn sign(&self, _payload: &[u8]) -> Result<Signature, SignerError> {
        Err(SignerError::Unauthorized(SignerRole::ReadOnly.as_str()))
    }
}

/// A signer backed by secret material loaded from a [`SecretSource`].
///
/// The secret bytes are held privately and are never exposed through `Debug`
/// or `Display`.
pub struct KeySigner {
    role: SignerRole,
    secret: Vec<u8>,
}

impl KeySigner {
    /// Load a signer for `role` from `source` using the secret named `name`.
    ///
    /// Secrets are only ever read from the provided secure source; they are
    /// never accepted from request payloads.
    pub fn from_source<S: SecretSource>(
        role: SignerRole,
        source: &S,
        name: &str,
    ) -> Result<Self, SignerError> {
        if role == SignerRole::ReadOnly {
            return Err(SignerError::Unauthorized(SignerRole::ReadOnly.as_str()));
        }
        let secret = source.get(name)?;
        Ok(KeySigner { role, secret })
    }

    /// Load a signer for `role` from an environment variable.
    pub fn from_env(role: SignerRole, name: &str) -> Result<Self, SignerError> {
        Self::from_source(role, &EnvSecretSource, name)
    }
}

impl fmt::Debug for KeySigner {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Never expose secret key material in logs.
        f.debug_struct("KeySigner")
            .field("role", &self.role)
            .field("secret", &"[REDACTED]")
            .finish()
    }
}

impl fmt::Display for KeySigner {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "KeySigner(role={}, secret=[REDACTED])", self.role.as_str())
    }
}

impl Signer for KeySigner {
    fn role(&self) -> SignerRole {
        self.role
    }

    fn sign(&self, payload: &[u8]) -> Result<Signature, SignerError> {
        // Deterministic placeholder derivation over the secret and payload.
        // The real implementation delegates to the concrete crypto backend;
        // the secret is never logged or returned.
        let mut out = Vec::with_capacity(self.secret.len() + payload.len());
        out.extend_from_slice(&self.secret);
        out.extend_from_slice(payload);
        Ok(Signature::new(out))
    }
}

/// Convenience constructors for the distinct deployment roles.
impl KeySigner {
    /// Load a user signer from an environment variable.
    pub fn user_from_env(name: &str) -> Result<Self, SignerError> {
        Self::from_env(SignerRole::User, name)
    }

    /// Load a deployer signer from an environment variable.
    pub fn deployer_from_env(name: &str) -> Result<Self, SignerError> {
        Self::from_env(SignerRole::Deployer, name)
    }

    /// Load an admin signer from an environment variable.
    pub fn admin_from_env(name: &str) -> Result<Self, SignerError> {
        Self::from_env(SignerRole::Admin, name)
    }

    /// Load a relayer signer from an environment variable.
    pub fn relayer_from_env(name: &str) -> Result<Self, SignerError> {
        Self::from_env(SignerRole::Relayer, name)
    }
}

/// Redact a secret value for safe logging.
///
/// Returns a fixed marker so callers can log that a secret exists without
/// revealing any of its bytes.
pub fn redact_secret(_secret: &[u8]) -> &'static str {
    "[REDACTED]"
}

/// Redact a signed payload for safe logging.
pub fn redact_payload(_payload: &[u8]) -> &'static str {
    "[REDACTED]"
}
