//! Reproducible Soroban deployment validation tooling (issue #749).
//!
//! This module provides the pre-submission validation layer used by the
//! Rust-native deployment command. It validates the network selection, admin
//! address, contract WASM hash, constructor arguments, and target addresses
//! before any transaction is submitted, and it refuses accidental mainnet
//! deployments unless the caller explicitly confirms them.
//!
//! The command supports a dry-run mode that performs the full validation pass
//! without submitting a transaction, and it writes a deployment manifest
//! containing the ledger, WASM hash, and resulting IDs.

use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

/// Networks the deployment command is allowed to target.
///
/// There is deliberately no implicit default: callers must select a network
/// explicitly so a missing flag can never silently resolve to mainnet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Network {
    Testnet,
    Futurenet,
    Mainnet,
}

impl Network {
    /// Parse an explicit network selection.
    pub fn parse(value: &str) -> Result<Self, DeployError> {
        match value.trim().to_ascii_lowercase().as_str() {
            "testnet" => Ok(Network::Testnet),
            "futurenet" => Ok(Network::Futurenet),
            "mainnet" | "public" => Ok(Network::Mainnet),
            other => Err(DeployError::InvalidNetwork(other.to_string())),
        }
    }

    /// Whether this network is a production network that requires confirmation.
    pub fn is_production(self) -> bool {
        matches!(self, Network::Mainnet)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Network::Testnet => "testnet",
            Network::Futurenet => "futurenet",
            Network::Mainnet => "mainnet",
        }
    }
}

/// Errors surfaced by the deployment validation layer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeployError {
    /// No network was selected (explicit selection is required).
    MissingNetwork,
    /// The network string was not recognized.
    InvalidNetwork(String),
    /// A production network was selected without explicit confirmation.
    MainnetNotConfirmed,
    /// The admin address was missing or malformed.
    InvalidAdmin(String),
    /// The contract WASM hash was missing or malformed.
    InvalidWasmHash(String),
    /// A constructor argument was missing or malformed.
    InvalidConstructorArg { name: String, reason: String },
    /// A target address was missing or malformed.
    InvalidAddress { name: String, value: String },
    /// The manifest could not be written.
    ManifestWrite(String),
}

impl fmt::Display for DeployError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DeployError::MissingNetwork => {
                write!(f, "no network selected; pass --network explicitly")
            }
            DeployError::InvalidNetwork(n) => write!(f, "unknown network: {n}"),
            DeployError::MainnetNotConfirmed => write!(
                f,
                "refusing mainnet deployment without --confirm-mainnet"
            ),
            DeployError::InvalidAdmin(a) => write!(f, "invalid admin address: {a}"),
            DeployError::InvalidWasmHash(h) => write!(f, "invalid contract WASM hash: {h}"),
            DeployError::InvalidConstructorArg { name, reason } => {
                write!(f, "invalid constructor argument {name}: {reason}")
            }
            DeployError::InvalidAddress { name, value } => {
                write!(f, "invalid address {name}: {value}")
            }
            DeployError::ManifestWrite(e) => write!(f, "failed to write manifest: {e}"),
        }
    }
}

impl std::error::Error for DeployError {}

/// A single constructor argument supplied to the contract.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConstructorArg {
    pub name: String,
    pub value: String,
}

/// A named target address (e.g. admin, treasury, fee recipient).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TargetAddress {
    pub name: String,
    pub value: String,
}

/// Fully specified deployment request, as parsed from CLI flags.
#[derive(Debug, Clone)]
pub struct DeployRequest {
    /// Explicit network selection. `None` means the flag was omitted.
    pub network: Option<Network>,
    /// Whether the caller confirmed a production deployment.
    pub confirm_mainnet: bool,
    /// Whether to validate only, without submitting a transaction.
    pub dry_run: bool,
    /// Admin address that will own the deployed contract.
    pub admin: String,
    /// Expected contract WASM hash (hex, 32 bytes).
    pub wasm_hash: String,
    /// Constructor arguments in declaration order.
    pub constructor_args: Vec<ConstructorArg>,
    /// Additional target addresses referenced by the deployment.
    pub addresses: Vec<TargetAddress>,
}

/// Result of a successful validation pass.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedDeployment {
    pub network: Network,
    pub dry_run: bool,
    pub admin: String,
    pub wasm_hash: String,
    pub constructor_args: Vec<ConstructorArg>,
    pub addresses: Vec<TargetAddress>,
}

/// A reproducible record of a deployment, written to disk as JSON.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeploymentManifest {
    pub network: String,
    pub dry_run: bool,
    pub ledger: u32,
    pub wasm_hash: String,
    pub contract_id: String,
    pub admin: String,
    pub constructor_args: BTreeMap<String, String>,
    pub addresses: BTreeMap<String, String>,
}

/// Validate a deployment request before any transaction is submitted.
///
/// This performs the full pre-submission check: explicit network selection,
/// mainnet confirmation, admin address, WASM hash, constructor arguments, and
/// target addresses. It never submits a transaction, so it is safe to call in
/// dry-run mode.
pub fn validate(request: &DeployRequest) -> Result<ValidatedDeployment, DeployError> {
    let network = request.network.ok_or(DeployError::MissingNetwork)?;

    if network.is_production() && !request.confirm_mainnet {
        return Err(DeployError::MainnetNotConfirmed);
    }

    validate_address("admin", &request.admin)?;
    validate_wasm_hash(&request.wasm_hash)?;

    for arg in &request.constructor_args {
        if arg.name.trim().is_empty() {
            return Err(DeployError::InvalidConstructorArg {
                name: arg.name.clone(),
                reason: "argument name must not be empty".to_string(),
            });
        }
        if arg.value.trim().is_empty() {
            return Err(DeployError::InvalidConstructorArg {
                name: arg.name.clone(),
                reason: "argument value must not be empty".to_string(),
            });
        }
    }

    for address in &request.addresses {
        validate_address(&address.name, &address.value)?;
    }

    Ok(ValidatedDeployment {
        network,
        dry_run: request.dry_run,
        admin: request.admin.clone(),
        wasm_hash: request.wasm_hash.clone(),
        constructor_args: request.constructor_args.clone(),
        addresses: request.addresses.clone(),
    })
}

/// Validate a Stellar/Soroban address (account `G...` or contract `C...`).
fn validate_address(name: &str, value: &str) -> Result<(), DeployError> {
    let trimmed = value.trim();
    let valid_prefix = trimmed.starts_with('G') || trimmed.starts_with('C');
    let valid_len = trimmed.len() == 56;
    let valid_charset = trimmed
        .chars()
        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit());

    if !valid_prefix || !valid_len || !valid_charset {
        return Err(DeployError::InvalidAddress {
            name: name.to_string(),
            value: value.to_string(),
        });
    }
    Ok(())
}

/// Validate a contract WASM hash: 64 lowercase/uppercase hex characters.
fn validate_wasm_hash(hash: &str) -> Result<(), DeployError> {
    let trimmed = hash.trim();
    let valid_len = trimmed.len() == 64;
    let valid_hex = trimmed.chars().all(|c| c.is_ascii_hexdigit());

    if !valid_len || !valid_hex {
        return Err(DeployError::InvalidWasmHash(hash.to_string()));
    }
    Ok(())
}

/// Write a deployment manifest to `path` as pretty-printed JSON.
///
/// The manifest records the ledger, WASM hash, and resulting IDs so a
/// deployment can be reproduced and audited after the fact.
pub fn write_manifest(path: &Path, manifest: &DeploymentManifest) -> Result<(), DeployError> {
    let json = render_manifest(manifest);
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| DeployError::ManifestWrite(e.to_string()))?;
        }
    }
    fs::write(path, json).map_err(|e| DeployError::ManifestWrite(e.to_string()))
}

/// Default manifest path for a given network.
pub fn default_manifest_path(network: Network) -> PathBuf {
    PathBuf::from(format!("deployments/{}.json", network.as_str()))
}

/// Render a manifest as deterministic, pretty-printed JSON.
fn render_manifest(manifest: &DeploymentManifest) -> String {
    let mut out = String::new();
    out.push_str("{\n");
    out.push_str(&format!("  \"network\": \"{}\",\n", manifest.network));
    out.push_str(&format!("  \"dry_run\": {},\n", manifest.dry_run));
    out.push_str(&format!("  \"ledger\": {},\n", manifest.ledger));
    out.push_str(&format!("  \"wasm_hash\": \"{}\",\n", manifest.wasm_hash));
    out.push_str(&format!("  \"contract_id\": \"{}\",\n", manifest.contract_id));
    out.push_str(&format!("  \"admin\": \"{}\",\n", manifest.admin));
    out.push_str(&format!(
        "  \"constructor_args\": {},\n",
        render_map(&manifest.constructor_args)
    ));
    out.push_str(&format!(
        "  \"addresses\": {}\n",
        render_map(&manifest.addresses)
    ));
    out.push_str("}\n");
    out
}

fn render_map(map: &BTreeMap<String, String>) -> String {
    if map.is_empty() {
        return "{}".to_string();
    }
    let entries: Vec<String> = map
        .iter()
        .map(|(k, v)| format!("\"{}\": \"{}\"", k, v))
        .collect();
    format!("{{ {} }}", entries.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_request() -> DeployRequest {
        DeployRequest {
            network: Some(Network::Testnet),
            confirm_mainnet: false,
            dry_run: true,
            admin: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF".to_string(),
            wasm_hash: "a".repeat(64),
            constructor_args: vec![ConstructorArg {
                name: "admin".to_string(),
                value: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF".to_string(),
            }],
            addresses: vec![TargetAddress {
                name: "treasury".to_string(),
                value: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF".to_string(),
            }],
        }
    }

    #[test]
    fn requires_explicit_network() {
        let mut req = valid_request();
        req.network = None;
        assert_eq!(validate(&req), Err(DeployError::MissingNetwork));
    }

    #[test]
    fn refuses_unconfirmed_mainnet() {
        let mut req = valid_request();
        req.network = Some(Network::Mainnet);
        assert_eq!(validate(&req), Err(DeployError::MainnetNotConfirmed));
    }

    #[test]
    fn accepts_confirmed_mainnet() {
        let mut req = valid_request();
        req.network = Some(Network::Mainnet);
        req.confirm_mainnet = true;
        assert!(validate(&req).is_ok());
    }

    #[test]
    fn rejects_bad_wasm_hash() {
        let mut req = valid_request();
        req.wasm_hash = "not-a-hash".to_string();
        assert!(matches!(validate(&req), Err(DeployError::InvalidWasmHash(_))));
    }

    #[test]
    fn rejects_bad_address() {
        let mut req = valid_request();
        req.admin = "nope".to_string();
        assert!(matches!(validate(&req), Err(DeployError::InvalidAddress { .. })));
    }

    #[test]
    fn dry_run_is_preserved() {
        let req = valid_request();
        let validated = validate(&req).expect("valid request");
        assert!(validated.dry_run);
        assert_eq!(validated.network, Network::Testnet);
    }

    #[test]
    fn manifest_renders_ledger_hash_and_ids() {
        let mut args = BTreeMap::new();
        args.insert("admin".to_string(), "GADMIN".to_string());
        let manifest = DeploymentManifest {
            network: "testnet".to_string(),
            dry_run: false,
            ledger: 12345,
            wasm_hash: "a".repeat(64),
            contract_id: "CABC".to_string(),
            admin: "GADMIN".to_string(),
            constructor_args: args,
            addresses: BTreeMap::new(),
        };
        let json = render_manifest(&manifest);
        assert!(json.contains("\"ledger\": 12345"));
        assert!(json.contains("\"contract_id\": \"CABC\""));
        assert!(json.contains("\"wasm_hash\""));
    }
}
