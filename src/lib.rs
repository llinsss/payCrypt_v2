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

/// Reads signer material from environment
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

/// The kind of StrKey encoded value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StrKeyType {
    /// `G...` account ID (ed25519 public key).
    AccountId,
    /// `C...` contract ID.
    ContractId,
    /// `M...` muxed account ID.
    MuxedAccount,
}

impl StrKeyType {
    /// The StrKey version byte for this type.
    pub fn version_byte(self) -> u8 {
        match self {
            StrKeyType::AccountId => 6 << 3,
            StrKeyType::ContractId => 2 << 3,
            StrKeyType::MuxedAccount => 12 << 3,
        }
    }

    /// The expected decoded payload length (excluding version byte and checksum).
    pub fn payload_len(self) -> usize {
        match self {
            StrKeyType::AccountId => 32,
            StrKeyType::ContractId => 32,
            StrKeyType::MuxedAccount => 40,
        }
    }

    /// The leading character of the encoded form.
    pub fn prefix(self) -> char {
        match self {
            StrKeyType::AccountId => 'G',
            StrKeyType::ContractId => 'C',
            StrKeyType::MuxedAccount => 'M',
        }
    }
}
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

/// A validated StrKey-encoded Stellar identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StrKey {
    kind: StrKeyType,
    encoded: String,
}

impl StrKey {
    /// Parse and validate a StrKey string, requiring the given type.
    pub fn parse_typed(s: &str, expected: StrKeyType) -> Result<Self, ValidationError> {
        let kind = Self::detect_kind(s)?;
        if kind != expected {
            return Err(ValidationError::WrongStrKeyType {
                expected,
                found: kind,
            });
        }
        Self::validate_payload(s, kind)?;
        Ok(StrKey {
            kind,
            encoded: s.to_string(),
        })
    }

    /// Parse and validate a `G...` account ID.
    pub fn parse_account_id(s: &str) -> Result<Self, ValidationError> {
        Self::parse_typed(s, StrKeyType::AccountId)
    }

    /// Parse and validate a `C...` contract ID.
    pub fn parse_contract_id(s: &str) -> Result<Self, ValidationError> {
        Self::parse_typed(s, StrKeyType::ContractId)
    }

    /// Parse and validate an `M...` muxed account ID.
    pub fn parse_muxed_account(s: &str) -> Result<Self, ValidationError> {
        Self::parse_typed(s, StrKeyType::MuxedAccount)
    }

    /// The type of this StrKey.
    pub fn kind(&self) -> StrKeyType {
        self.kind
    }

    /// The canonical encoded string.
    pub fn as_str(&self) -> &str {
        &self.encoded
    }

    fn detect_kind(s: &str) -> Result<StrKeyType, ValidationError> {
        if s.is_empty() {
            return Err(ValidationError::Empty);
        }
        match s.chars().next().unwrap() {
            'G' => Ok(StrKeyType::AccountId),
            'C' => Ok(StrKeyType::ContractId),
            'M' => Ok(StrKeyType::MuxedAccount),
            _ => Err(ValidationError::WrongStrKeyType {
                expected: StrKeyType::AccountId,
                found: StrKeyType::AccountId,
            }),
        }
    }

    fn validate_payload(s: &str, kind: StrKeyType) -> Result<(), ValidationError> {
        let decoded = base32_decode(s)?;
        if decoded.is_empty() {
            return Err(ValidationError::Empty);
        }
        let version = decoded[0];
        if version != kind.version_byte() {
            return Err(ValidationError::WrongStrKeyType {
                expected: kind,
                found: kind,
            });
        }
        let payload = &decoded[1..decoded.len().saturating_sub(2)];
        if payload.len() != kind.payload_len() {
            return Err(ValidationError::InvalidLength {
                expected: kind.payload_len(),
                found: payload.len(),
            });
        }
        let checksum = &decoded[decoded.len().saturating_sub(2)..];
        let expected = crc16_xmodem(&decoded[..decoded.len().saturating_sub(2)]);
        let found = ((checksum[0] as u16) << 8) | checksum[1] as u16;
        if expected != found {
            return Err(ValidationError::InvalidChecksum);
        }
        Ok(())
    }
}

impl fmt::Display for StrKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.encoded)
    }
}

/// A validated Stellar asset.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Asset {
    /// The native XLM asset.
    Native,
    /// An issued asset with a code and issuer account.
    Issued { code: String, issuer: StrKey },
}

impl Asset {
    /// Construct the native asset.
    pub fn native() -> Self {
        Asset::Native
    }

    /// Construct a validated issued asset.
    pub fn issued(code: &str, issuer: &str) -> Result<Self, ValidationError> {
        validate_asset_code(code)?;
        let issuer = StrKey::parse_account_id(issuer)?;
        Ok(Asset::Issued {
            code: code.to_string(),
            issuer,
        })
    }

    /// Whether this is the native asset.
    pub fn is_native(&self) -> bool {
        matches!(self, Asset::Native)
    }

    /// Require this asset to be native, rejecting issued assets.
    pub fn require_native(&self) -> Result<(), ValidationError> {
        if self.is_native() {
            Ok(())
        } else {
            Err(ValidationError::NativeTokenConfusion)
        }
    }

    /// Require this asset to be issued, rejecting the native asset.
    pub fn require_issued(&self) -> Result<(), ValidationError> {
        if self.is_native() {
            Err(ValidationError::NativeTokenConfusion)
        } else {
            Ok(())
        }
    }
}

/// Validate an asset code: 1-12 alphanumeric characters.
pub fn validate_asset_code(code: &str) -> Result<(), ValidationError> {
    if code.is_empty() || code.len() > 12 {
        return Err(ValidationError::InvalidAssetCode);
    }
    if !code.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(ValidationError::InvalidAssetCode);
    }
    Ok(())
}

/// A validated network passphrase.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Network {
    passphrase: String,
}

impl Network {
    /// The Stellar public network passphrase.
    pub const PUBLIC: &'static str = "Public Global Stellar Network ; September 2015";
    /// The Stellar test network passphrase.
    pub const TESTNET: &'static str = "Test SDF Network ; September 2015";

    /// Construct a network from a passphrase, rejecting empty passphrases.
    pub fn new(passphrase: &str) -> Result<Self, ValidationError> {
        if passphrase.is_empty() {
            return Err(ValidationError::EmptyNetworkPassphrase);
        }
        Ok(Network {
            passphrase: passphrase.to_string(),
        })
    }

    /// The public network.
    pub fn public() -> Self {
        Network {
            passphrase: Self::PUBLIC.to_string(),
        }
    }

    /// The test network.
    pub fn testnet() -> Self {
        Network {
            passphrase: Self::TESTNET.to_string(),
        }
    }

    /// The passphrase string.
    pub fn passphrase(&self) -> &str {
        &self.passphrase
    }

    /// Ensure this network matches the expected network, rejecting cross-network use.
    pub fn require(&self, expected: &Network) -> Result<(), ValidationError> {
        if self.passphrase == expected.passphrase {
            Ok(())
        } else {
            Err(ValidationError::NetworkMismatch {
                expected: expected.passphrase.clone(),
                found: self.passphrase.clone(),
            })
        }
    }
}

/// A contract call target that has been validated against a network.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractCall {
    contract_id: StrKey,
    network: Network,
}

impl ContractCall {
    /// Build a validated contract call, ensuring the contract ID is a `C...`
    /// StrKey and the network passphrase is valid.
    pub fn new(contract_id: &str, network: Network) -> Result<Self, ValidationError> {
        let contract_id = StrKey::parse_contract_id(contract_id)?;
        Ok(ContractCall {
            contract_id,
            network,
        })
    }

    /// The validated contract ID.
    pub fn contract_id(&self) -> &StrKey {
        &self.contract_id
    }

    /// The network this call targets.
    pub fn network(&self) -> &Network {
        &self.network
    }

    /// Ensure the call targets the expected network before execution.
    pub fn ensure_network(&self, expected: &Network) -> Result<(), ValidationError> {
        self.network.require(expected)
    }
}

fn base32_decode(s: &str) -> Result<Vec<u8>, ValidationError> {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut bits: u32 = 0;
    let mut value: u32 = 0;
    let mut out = Vec::new();
    for c in s.chars() {
        let idx = ALPHABET
            .iter()
            .position(|&b| b as char == c)
            .ok_or(ValidationError::InvalidBase32)? as u32;
        value = (value << 5) | idx;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push(((value >> bits) & 0xff) as u8);
        }
    }
    Ok(out)
}

fn crc16_xmodem(data: &[u8]) -> u16 {
    let mut crc: u16 = 0;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            if crc & 0x8000 != 0 {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

/// The type of a StrKey, including its version byte, payload length, and prefix.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StrKeyType {
    AccountId,
    ContractId,
    MuxedAccount,
}

impl StrKeyType {
    /// The version byte of the encoded form.
    pub fn version_byte(self) -> u8 {
        match self {
            StrKeyType::AccountId => 6 << 3,
            StrKeyType::ContractId => 2 << 3,
            StrKeyType::MuxedAccount => 12 << 3,
        }
    }

    /// The length of the payload (excluding version byte and checksum).
    pub fn payload_len(self) -> usize {
        match self {
            StrKeyType::AccountId => 32,
            StrKeyType::ContractId => 32,
            StrKeyType::MuxedAccount => 40,
        }
    }

    /// The leading character of the encoded form.
    pub fn prefix(self) -> char {
        match self {
            StrKeyType::AccountId => 'G',
            StrKeyType::ContractId => 'C',
            StrKeyType::MuxedAccount => 'M',
        }
    }
}

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

    #[test]
    fn rejects_empty_strkey() {
        assert_eq!(StrKey::parse_account_id(""), Err(ValidationError::Empty));
    }

    #[test]
    fn rejects_wrong_prefix() {
        assert!(StrKey::parse_account_id("CAAAA").is_err());
        assert!(StrKey::parse_contract_id("GAAAA").is_err());
    }

    #[test]
    fn rejects_invalid_base32() {
        assert_eq!(
            StrKey::parse_account_id("G0!!!!"),
            Err(ValidationError::InvalidBase32)
        );
    }

    #[test]
    fn rejects_bad_checksum() {
        // Valid base32 but wrong checksum.
        let bad = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        assert!(StrKey::parse_account_id(bad).is_err());
    }

    #[test]
    fn validates_asset_codes() {
        assert!(validate_asset_code("USD").is_ok());
        assert!(validate_asset_code("A").is_ok());
        assert!(validate_asset_code("ABCDEFGHIJKL").is_ok());
        assert_eq!(validate_asset_code(""), Err(ValidationError::InvalidAssetCode));
        assert_eq!(
            validate_asset_code("ABCDEFGHIJKLM"),
            Err(ValidationError::InvalidAssetCode)
        );
        assert_eq!(
            validate_asset_code("US-D"),
            Err(ValidationError::InvalidAssetCode)
        );
    }

    #[test]
    fn rejects_native_token_confusion() {
        let native = Asset::native();
        assert_eq!(native.require_issued(), Err(ValidationError::NativeTokenConfusion));
        assert!(native.require_native().is_ok());
    }

    #[test]
    fn rejects_cross_network() {
        let public = Network::public();
        let testnet = Network::testnet();
        assert!(public.require(&public).is_ok());
        assert!(matches!(
            public.require(&testnet),
            Err(ValidationError::NetworkMismatch { .. })
        ));
    }

    #[test]
    fn rejects_empty_network_passphrase() {
        assert_eq!(
            Network::new(""),
            Err(ValidationError::EmptyNetworkPassphrase)
        );
    }

    #[test]
    fn contract_call_requires_contract_id() {
        let network = Network::testnet();
        assert!(ContractCall::new("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", network.clone()).is_err());
        assert!(ContractCall::new("", network).is_err());
    }
    }
}
