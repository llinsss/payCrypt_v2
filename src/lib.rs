//! Typed Stellar address and asset validation.
//!
//! This module provides strongly-typed wrappers around Stellar StrKey
//! encoded identifiers (accounts, contract IDs, muxed accounts) and asset
//! descriptors, validating them before they can reach contract calls.
//!
//! The goal is to prevent malformed public keys, contract IDs, asset codes,
//! issuers, and network mismatches from being used in contract invocations.

use std::fmt;

/// Errors produced while validating Stellar addresses, assets, or networks.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationError {
    /// The StrKey string was empty.
    Empty,
    /// The StrKey version byte did not match the expected type.
    WrongStrKeyType {
        expected: StrKeyType,
        found: StrKeyType,
    },
    /// The StrKey payload was not valid base32.
    InvalidBase32,
    /// The decoded StrKey length was not the expected length.
    InvalidLength { expected: usize, found: usize },
    /// The StrKey checksum did not match.
    InvalidChecksum,
    /// The asset code was not 1-12 alphanumeric characters.
    InvalidAssetCode,
    /// A native asset was used where an issued asset was required, or vice versa.
    NativeTokenConfusion,
    /// The network passphrase did not match the expected network.
    NetworkMismatch {
        expected: String,
        found: String,
    },
    /// The network passphrase was empty.
    EmptyNetworkPassphrase,
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::Empty => write!(f, "value is empty"),
            ValidationError::WrongStrKeyType { expected, found } => write!(
                f,
                "wrong StrKey type: expected {:?}, found {:?}",
                expected, found
            ),
            ValidationError::InvalidBase32 => write!(f, "invalid base32 encoding"),
            ValidationError::InvalidLength { expected, found } => write!(
                f,
                "invalid length: expected {}, found {}",
                expected, found
            ),
            ValidationError::InvalidChecksum => write!(f, "invalid StrKey checksum"),
            ValidationError::InvalidAssetCode => {
                write!(f, "asset code must be 1-12 alphanumeric characters")
            }
            ValidationError::NativeTokenConfusion => {
                write!(f, "native/token confusion: native asset used where issued asset required")
            }
            ValidationError::NetworkMismatch { expected, found } => write!(
                f,
                "network mismatch: expected passphrase {:?}, found {:?}",
                expected, found
            ),
            ValidationError::EmptyNetworkPassphrase => {
                write!(f, "network passphrase is empty")
            }
        }
    }
}

impl std::error::Error for ValidationError {}

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

#[cfg(test)]
mod tests {
    use super::*;

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
