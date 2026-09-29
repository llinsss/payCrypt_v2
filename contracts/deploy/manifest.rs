//! Reproducible Soroban deployment manifest tooling (issue #749).
//!
//! This module provides the Rust-native pieces used by the deployment command to
//! validate a deployment request *before* any transaction is submitted, and to
//! record a reproducible manifest of what was deployed.
//!
//! The command itself is intentionally thin: it parses arguments, builds a
//! [`DeploymentRequest`], runs [`validate_request`], and (unless `--dry-run` is
//! set) submits the transaction and writes a [`DeploymentManifest`].

use std::fmt;
use std::fs;
use std::path::Path;

/// Networks a deployment may target.
///
/// There is deliberately no `Default` implementation: the network must always be
/// selected explicitly so a deployment can never silently fall back to a network.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Network {
    Testnet,
    Futurenet,
    Mainnet,
}

impl Network {
    /// Parse an explicit `--network` value.
    pub fn parse(value: &str) -> Result<Self, DeployError> {
        match value.trim().to_ascii_lowercase().as_str() {
            "testnet" => Ok(Network::Testnet),
            "futurenet" => Ok(Network::Futurenet),
            "mainnet" | "public" => Ok(Network::Mainnet),
            other => Err(DeployError::InvalidNetwork(other.to_string())),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Network::Testnet => "testnet",
            Network::Futurenet => "futurenet",
            Network::Mainnet => "mainnet",
        }
    }

    /// Mainnet is the only network that requires an explicit confirmation flag.
    pub fn requires_confirmation(self) -> bool {
        matches!(self, Network::Mainnet)
    }
}

impl fmt::Display for Network {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

/// A fully specified deployment request, assembled from CLI arguments.
#[derive(Debug, Clone)]
pub struct DeploymentRequest {
    pub network: Network,
    /// Admin address that will own the deployed contract.
    pub admin: String,
    /// Hex-encoded SHA-256 hash of the contract WASM being deployed.
    pub wasm_hash: String,
    /// Constructor arguments, in declaration order.
    pub constructor_args: Vec<String>,
    /// Addresses the deployment is expected to interact with.
    pub addresses: Vec<String>,
    /// Set when the operator passed `--confirm-mainnet`.
    pub mainnet_confirmed: bool,
    /// When true, validation runs but nothing is submitted.
    pub dry_run: bool,
}

/// Errors surfaced by validation. Each variant maps to a single, actionable
/// failure so the CLI can print a precise message and exit non-zero.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeployError {
    InvalidNetwork(String),
    MissingAdmin,
    InvalidAdmin(String),
    MissingWasmHash,
    InvalidWasmHash(String),
    MissingConstructorArg(usize),
    InvalidAddress(String),
    MainnetNotConfirmed,
}

impl fmt::Display for DeployError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            DeployError::InvalidNetwork(v) => write!(f, "unknown network `{v}` (expected testnet, futurenet, or mainnet)"),
            DeployError::MissingAdmin => write!(f, "admin address is required"),
            DeployError::InvalidAdmin(v) => write!(f, "admin address `{v}` is not a valid Stellar address"),
            DeployError::MissingWasmHash => write!(f, "contract WASM hash is required"),
            DeployError::InvalidWasmHash(v) => write!(f, "WASM hash `{v}` must be 64 hex characters"),
            DeployError::MissingConstructorArg(i) => write!(f, "constructor argument {i} is empty"),
            DeployError::InvalidAddress(v) => write!(f, "address `{v}` is not a valid Stellar address"),
            DeployError::MainnetNotConfirmed => write!(f, "refusing mainnet deployment without --confirm-mainnet"),
        }
    }
}

impl std::error::Error for DeployError {}

/// Validate a deployment request before any transaction is submitted.
///
/// This is the single gate used by both dry-run and live deployments, so a
/// dry-run exercises exactly the same checks as a real submission.
pub fn validate_request(req: &DeploymentRequest) -> Result<(), DeployError> {
    if req.network.requires_confirmation() && !req.mainnet_confirmed {
        return Err(DeployError::MainnetNotConfirmed);
    }

    if req.admin.trim().is_empty() {
        return Err(DeployError::MissingAdmin);
    }
    if !is_valid_address(&req.admin) {
        return Err(DeployError::InvalidAdmin(req.admin.clone()));
    }

    if req.wasm_hash.trim().is_empty() {
        return Err(DeployError::MissingWasmHash);
    }
    if !is_valid_wasm_hash(&req.wasm_hash) {
        return Err(DeployError::InvalidWasmHash(req.wasm_hash.clone()));
    }

    for (i, arg) in req.constructor_args.iter().enumerate() {
        if arg.trim().is_empty() {
            return Err(DeployError::MissingConstructorArg(i));
        }
    }

    for addr in &req.addresses {
        if !is_valid_address(addr) {
            return Err(DeployError::InvalidAddress(addr.clone()));
        }
    }

    Ok(())
}

/// A Stellar address is a 56-character StrKey beginning with `G` (account) or
/// `C` (contract).
fn is_valid_address(value: &str) -> bool {
    let v = value.trim();
    v.len() == 56
        && (v.starts_with('G') || v.starts_with('C'))
        && v.chars().all(|c| c.is_ascii_alphanumeric())
}

/// A WASM hash is the 32-byte SHA-256 digest rendered as 64 hex characters.
fn is_valid_wasm_hash(value: &str) -> bool {
    let v = value.trim();
    v.len() == 64 && v.chars().all(|c| c.is_ascii_hexdigit())
}

/// The reproducible record written after a successful deployment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeploymentManifest {
    pub network: Network,
    pub contract_id: String,
    pub wasm_hash: String,
    pub admin: String,
    pub ledger: u32,
    pub constructor_args: Vec<String>,
    pub addresses: Vec<String>,
}

impl DeploymentManifest {
    /// Render the manifest as deterministic JSON so repeated deployments of the
    /// same inputs produce byte-identical output (modulo ledger/contract id).
    pub fn to_json(&self) -> String {
        let args = json_string_array(&self.constructor_args);
        let addresses = json_string_array(&self.addresses);
        format!(
            concat!(
                "{{\n",
                "  \"network\": \"{}\",\n",
                "  \"contract_id\": \"{}\",\n",
                "  \"wasm_hash\": \"{}\",\n",
                "  \"admin\": \"{}\",\n",
                "  \"ledger\": {},\n",
                "  \"constructor_args\": {},\n",
                "  \"addresses\": {}\n",
                "}}\n"
            ),
            self.network.as_str(),
            self.contract_id,
            self.wasm_hash,
            self.admin,
            self.ledger,
            args,
            addresses,
        )
    }

    /// Persist the manifest to `path`, creating parent directories as needed.
    pub fn write_to(&self, path: impl AsRef<Path>) -> std::io::Result<()> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent)?;
            }
        }
        fs::write(path, self.to_json())
    }
}

fn json_string_array(values: &[String]) -> String {
    let items: Vec<String> = values
        .iter()
        .map(|v| format!("\"{}\"", v.replace('\\', "\\\\").replace('"', "\\\"")))
        .collect();
    format!("[{}]", items.join(", "))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_request() -> DeploymentRequest {
        DeploymentRequest {
            network: Network::Testnet,
            admin: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF".to_string(),
            wasm_hash: "a".repeat(64),
            constructor_args: vec!["1000".to_string()],
            addresses: vec!["CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF".to_string()],
            mainnet_confirmed: false,
            dry_run: true,
        }
    }

    #[test]
    fn accepts_valid_testnet_request() {
        assert!(validate_request(&valid_request()).is_ok());
    }

    #[test]
    fn rejects_mainnet_without_confirmation() {
        let mut req = valid_request();
        req.network = Network::Mainnet;
        assert_eq!(validate_request(&req), Err(DeployError::MainnetNotConfirmed));
    }

    #[test]
    fn rejects_bad_wasm_hash() {
        let mut req = valid_request();
        req.wasm_hash = "not-a-hash".to_string();
        assert!(matches!(validate_request(&req), Err(DeployError::InvalidWasmHash(_))));
    }

    #[test]
    fn rejects_empty_constructor_arg() {
        let mut req = valid_request();
        req.constructor_args = vec!["  ".to_string()];
        assert_eq!(validate_request(&req), Err(DeployError::MissingConstructorArg(0)));
    }

    #[test]
    fn manifest_json_is_deterministic() {
        let manifest = DeploymentManifest {
            network: Network::Testnet,
            contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF".to_string(),
            wasm_hash: "a".repeat(64),
            admin: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF".to_string(),
            ledger: 42,
            constructor_args: vec!["1000".to_string()],
            addresses: vec![],
        };
        assert_eq!(manifest.to_json(), manifest.to_json());
        assert!(manifest.to_json().contains("\"ledger\": 42"));
    }
}
