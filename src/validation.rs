//! Typed Stellar address, asset, and network validation.
//!
//! Guards contract calls against malformed StrKey values, invalid asset codes,
//! native/token confusion, and cross-network mismatches.

use std::fmt;

/// Well-known Stellar network passphrases.
pub const PUBLIC_NETWORK_PASSPHRASE: &str = "Public Global Stellar Network ; September 2015";
pub const TESTNET_NETWORK_PASSPHRASE: &str = "Test SDF Network ; September 2015";
pub const FUTURENET_NETWORK_PASSPHRASE: &str = "Test SDF Future Network ; October 2022";

/// Errors produced by the validation helpers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ValidationError {
    /// A StrKey value was empty.
    EmptyStrKey,
    /// A StrKey value had an unexpected version byte / prefix.
    InvalidStrKeyPrefix { expected: char, found: char },
    /// A StrKey value contained characters outside the base32 alphabet.
    InvalidStrKeyEncoding,
    /// A StrKey value had an invalid length for its type.
    InvalidStrKeyLength { expected: usize, found: usize },
    /// A StrKey value failed its CRC16 checksum.
    InvalidStrKeyChecksum,
    /// An asset code was empty or longer than 12 characters.
    InvalidAssetCodeLength { found: usize },
    /// An asset code contained non-alphanumeric characters.
    InvalidAssetCodeCharacters,
    /// A native asset was supplied where an issued asset was required.
    NativeAssetNotAllowed,
    /// An issued asset was supplied where the native asset was required.
    IssuedAssetNotAllowed,
    /// A contract token was supplied where a classic asset was required.
    TokenContractNotAllowed,
    /// The network passphrase was empty.
    EmptyNetworkPassphrase,
    /// The network passphrase did not match the expected network.
    NetworkMismatch { expected: String, found: String },
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::EmptyStrKey => write!(f, "StrKey value is empty"),
            ValidationError::InvalidStrKeyPrefix { expected, found } => {
                write!(f, "invalid StrKey prefix: expected '{expected}', found '{found}'")
            }
            ValidationError::InvalidStrKeyEncoding => {
                write!(f, "StrKey value contains invalid base32 characters")
            }
            ValidationError::InvalidStrKeyLength { expected, found } => {
                write!(f, "invalid StrKey length: expected {expected}, found {found}")
            }
            ValidationError::InvalidStrKeyChecksum => write!(f, "StrKey checksum mismatch"),
            ValidationError::InvalidAssetCodeLength { found } => {
                write!(f, "asset code must be 1-12 characters, found {found}")
            }
            ValidationError::InvalidAssetCodeCharacters => {
                write!(f, "asset code must be alphanumeric")
            }
            ValidationError::NativeAssetNotAllowed => {
                write!(f, "native asset is not allowed here")
            }
            ValidationError::IssuedAssetNotAllowed => {
                write!(f, "issued asset is not allowed here")
            }
            ValidationError::TokenContractNotAllowed => {
                write!(f, "token contract is not allowed here")
            }
            ValidationError::EmptyNetworkPassphrase => write!(f, "network passphrase is empty"),
            ValidationError::NetworkMismatch { expected, found } => {
                write!(f, "network mismatch: expected '{expected}', found '{found}'")
            }
        }
    }
}

impl std::error::Error for ValidationError {}

/// A validated StrKey-encoded Stellar account (public key, `G...`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountId(String);

/// A validated StrKey-encoded Soroban contract ID (`C...`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractId(String);

/// A validated network passphrase.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NetworkPassphrase(String);

/// A validated classic Stellar asset.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Asset {
    /// The native XLM asset.
    Native,
    /// An issued asset with a code and a validated issuer account.
    Issued { code: String, issuer: AccountId },
}

impl AccountId {
    /// Parse and validate a StrKey-encoded account public key (`G...`).
    pub fn parse(value: &str) -> Result<Self, ValidationError> {
        validate_strkey(value, 'G', 56)?;
        Ok(AccountId(value.to_string()))
    }

    /// The underlying StrKey string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl ContractId {
    /// Parse and validate a StrKey-encoded contract ID (`C...`).
    pub fn parse(value: &str) -> Result<Self, ValidationError> {
        validate_strkey(value, 'C', 56)?;
        Ok(ContractId(value.to_string()))
    }

    /// The underlying StrKey string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl NetworkPassphrase {
    /// Parse and validate a non-empty network passphrase.
    pub fn parse(value: &str) -> Result<Self, ValidationError> {
        if value.trim().is_empty() {
            return Err(ValidationError::EmptyNetworkPassphrase);
        }
        Ok(NetworkPassphrase(value.to_string()))
    }

    /// The underlying passphrase string.
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Ensure this passphrase matches the expected network passphrase.
    pub fn ensure_matches(&self, expected: &str) -> Result<(), ValidationError> {
        if self.0 != expected {
            return Err(ValidationError::NetworkMismatch {
                expected: expected.to_string(),
                found: self.0.clone(),
            });
        }
        Ok(())
    }
}

impl Asset {
    /// The native XLM asset.
    pub fn native() -> Self {
        Asset::Native
    }

    /// Parse and validate an issued asset from its code and issuer.
    pub fn issued(code: &str, issuer: &str) -> Result<Self, ValidationError> {
        validate_asset_code(code)?;
        let issuer = AccountId::parse(issuer)?;
        Ok(Asset::Issued {
            code: code.to_string(),
            issuer,
        })
    }

    /// Whether this asset is the native XLM asset.
    pub fn is_native(&self) -> bool {
        matches!(self, Asset::Native)
    }

    /// Require the native asset, rejecting issued assets.
    pub fn require_native(&self) -> Result<(), ValidationError> {
        if self.is_native() {
            Ok(())
        } else {
            Err(ValidationError::IssuedAssetNotAllowed)
        }
    }

    /// Require an issued asset, rejecting the native asset.
    pub fn require_issued(&self) -> Result<(), ValidationError> {
        if self.is_native() {
            Err(ValidationError::NativeAssetNotAllowed)
        } else {
            Ok(())
        }
    }
}

/// Validate a StrKey value with the expected version prefix and length.
fn validate_strkey(value: &str, expected_prefix: char, expected_len: usize) -> Result<(), ValidationError> {
    if value.is_empty() {
        return Err(ValidationError::EmptyStrKey);
    }

    let mut chars = value.chars();
    let prefix = chars.next().expect("non-empty checked above");
    if prefix != expected_prefix {
        return Err(ValidationError::InvalidStrKeyPrefix {
            expected: expected_prefix,
            found: prefix,
        });
    }

    if value.len() != expected_len {
        return Err(ValidationError::InvalidStrKeyLength {
            expected: expected_len,
            found: value.len(),
        });
    }

    if !value.chars().all(|c| c.is_ascii_uppercase() || ('2'..='7').contains(&c)) {
        return Err(ValidationError::InvalidStrKeyEncoding);
    }

    if !strkey_checksum_valid(value) {
        return Err(ValidationError::InvalidStrKeyChecksum);
    }

    Ok(())
}

/// Validate an asset code: 1-12 alphanumeric characters.
fn validate_asset_code(code: &str) -> Result<(), ValidationError> {
    let len = code.len();
    if len == 0 || len > 12 {
        return Err(ValidationError::InvalidAssetCodeLength { found: len });
    }
    if !code.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(ValidationError::InvalidAssetCodeCharacters);
    }
    Ok(())
}

/// Reject a contract token where a classic asset is required.
pub fn reject_token_contract(contract: &str) -> Result<(), ValidationError> {
    if ContractId::parse(contract).is_ok() {
        return Err(ValidationError::TokenContractNotAllowed);
    }
    Ok(())
}

/// CRC16-XModem checksum used by StrKey, matching SEP-23.
fn strkey_checksum_valid(value: &str) -> bool {
    let decoded = match base32_decode(value) {
        Some(bytes) => bytes,
        None => return false,
    };
    if decoded.len() < 3 {
        return false;
    }
    let (payload, checksum) = decoded.split_at(decoded.len() - 2);
    let expected = crc16_xmodem(payload);
    let found = u16::from_le_bytes([checksum[0], checksum[1]]);
    expected == found
}

/// Decode a base32 (RFC 4648, no padding) string into bytes.
fn base32_decode(value: &str) -> Option<Vec<u8>> {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut buffer: u64 = 0;
    let mut bits: u32 = 0;
    let mut out = Vec::with_capacity(value.len() * 5 / 8);

    for byte in value.bytes() {
        let index = ALPHABET.iter().position(|&c| c == byte)? as u64;
        buffer = (buffer << 5) | index;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }

    Some(out)
}

/// CRC16-XModem, as specified by SEP-23 for StrKey checksums.
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

    const VALID_ACCOUNT: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF5";
    const VALID_CONTRACT: &str = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";

    #[test]
    fn accepts_valid_account_and_contract() {
        assert!(AccountId::parse(VALID_ACCOUNT).is_ok());
        assert!(ContractId::parse(VALID_CONTRACT).is_ok());
    }

    #[test]
    fn rejects_empty_and_wrong_prefix() {
        assert_eq!(AccountId::parse(""), Err(ValidationError::EmptyStrKey));
        assert!(matches!(
            AccountId::parse(VALID_CONTRACT),
            Err(ValidationError::InvalidStrKeyPrefix { .. })
        ));
        assert!(matches!(
            ContractId::parse(VALID_ACCOUNT),
            Err(ValidationError::InvalidStrKeyPrefix { .. })
        ));
    }

    #[test]
    fn rejects_bad_length_and_encoding() {
        assert!(matches!(
            AccountId::parse("GABC"),
            Err(ValidationError::InvalidStrKeyLength { .. })
        ));
        let mut lower = VALID_ACCOUNT.to_string();
        lower.replace_range(1..2, "a");
        assert_eq!(AccountId::parse(&lower), Err(ValidationError::InvalidStrKeyEncoding));
    }

    #[test]
    fn rejects_bad_checksum() {
        let mut tampered = VALID_ACCOUNT.to_string();
        tampered.replace_range(55..56, "A");
        assert_eq!(AccountId::parse(&tampered), Err(ValidationError::InvalidStrKeyChecksum));
    }

    #[test]
    fn validates_asset_codes() {
        assert!(Asset::issued("USDC", VALID_ACCOUNT).is_ok());
        assert!(matches!(
            Asset::issued("", VALID_ACCOUNT),
            Err(ValidationError::InvalidAssetCodeLength { .. })
        ));
        assert!(matches!(
            Asset::issued("TOOLONGASSETCODE", VALID_ACCOUNT),
            Err(ValidationError::InvalidAssetCodeLength { .. })
        ));
        assert_eq!(
            Asset::issued("US-C", VALID_ACCOUNT),
            Err(ValidationError::InvalidAssetCodeCharacters)
        );
    }

    #[test]
    fn rejects_native_token_confusion() {
        let native = Asset::native();
        assert_eq!(native.require_issued(), Err(ValidationError::NativeAssetNotAllowed));
        assert!(native.require_native().is_ok());

        let issued = Asset::issued("USDC", VALID_ACCOUNT).unwrap();
        assert_eq!(issued.require_native(), Err(ValidationError::IssuedAssetNotAllowed));
        assert!(issued.require_issued().is_ok());

        assert_eq!(
            reject_token_contract(VALID_CONTRACT),
            Err(ValidationError::TokenContractNotAllowed)
        );
        assert!(reject_token_contract(VALID_ACCOUNT).is_ok());
    }

    #[test]
    fn rejects_cross_network_mismatch() {
        let passphrase = NetworkPassphrase::parse(TESTNET_NETWORK_PASSPHRASE).unwrap();
        assert!(passphrase.ensure_matches(TESTNET_NETWORK_PASSPHRASE).is_ok());
        assert!(matches!(
            passphrase.ensure_matches(PUBLIC_NETWORK_PASSPHRASE),
            Err(ValidationError::NetworkMismatch { .. })
        ));
        assert_eq!(
            NetworkPassphrase::parse("   "),
            Err(ValidationError::EmptyNetworkPassphrase)
        );
    }

    #[test]
    fn property_malformed_inputs_never_panic() {
        let samples = [
            "", "G", "C", "gABC", "G0", "G!", "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF5",
            "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM", "not-a-key", "\u{1F600}",
        ];
        for sample in samples {
            let _ = AccountId::parse(sample);
            let _ = ContractId::parse(sample);
            let _ = Asset::issued(sample, sample);
            let _ = NetworkPassphrase::parse(sample);
        }
    }
}
