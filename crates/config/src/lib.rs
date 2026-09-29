//! Environment-specific Rust configuration validation.
//!
//! This crate provides deterministic, typed validation of environment-specific
//! configuration for the Rust/Soroban migration. It pins toolchain and dependency
//! inputs, computes a stable artifact identity, validates the target environment,
//! gates releases behind explicit approval, and supports rollback to a previously
//! approved configuration.
//!
//! All validation is deterministic: given the same inputs the same outcome and
//! artifact identity are produced, which makes results reproducible across CI and
//! local networks.

use std::collections::BTreeMap;
use std::fmt;

/// A pinned toolchain/dependency input.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PinnedInput {
    /// Logical name, e.g. `rustc`, `soroban-sdk`.
    pub name: String,
    /// Exact pinned version, e.g. `1.79.0`.
    pub version: String,
}

impl PinnedInput {
    pub fn new(name: impl Into<String>, version: impl Into<String>) -> Self {
        Self {
            name: name.into(),
            version: version.into(),
        }
    }
}

/// The environment a configuration targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    Local,
    Testnet,
    Mainnet,
}

impl Environment {
    /// Whether this environment requires an explicit release approval.
    pub fn requires_approval(self) -> bool {
        matches!(self, Environment::Mainnet)
    }

    fn as_str(self) -> &'static str {
        match self {
            Environment::Local => "local",
            Environment::Testnet => "testnet",
            Environment::Mainnet => "mainnet",
        }
    }
}

/// A release approval record.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Approval {
    pub approver: String,
    /// Monotonic nonce used to reject replays.
    pub nonce: u64,
}

/// Errors produced by configuration validation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConfigError {
    /// A required pinned input is missing.
    MissingInput(String),
    /// A pinned input has an empty version.
    EmptyVersion(String),
    /// The environment is not permitted for the given configuration.
    EnvironmentNotAllowed(Environment),
    /// A release approval is required but was not supplied.
    ApprovalRequired,
    /// The supplied approval was not authorized.
    Unauthorized(String),
    /// The approval nonce was already used (replay).
    Replay { nonce: u64 },
    /// The configuration failed a boundary check.
    BoundaryViolation(String),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::MissingInput(n) => write!(f, "missing pinned input: {n}"),
            ConfigError::EmptyVersion(n) => write!(f, "empty version for input: {n}"),
            ConfigError::EnvironmentNotAllowed(e) => {
                write!(f, "environment not allowed: {}", e.as_str())
            }
            ConfigError::ApprovalRequired => write!(f, "release approval required"),
            ConfigError::Unauthorized(a) => write!(f, "unauthorized approver: {a}"),
            ConfigError::Replay { nonce } => write!(f, "replayed approval nonce: {nonce}"),
            ConfigError::BoundaryViolation(m) => write!(f, "boundary violation: {m}"),
        }
    }
}

impl std::error::Error for ConfigError {}

/// An environment-specific configuration to validate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnvironmentConfig {
    pub environment: Environment,
    pub inputs: Vec<PinnedInput>,
    /// Maximum number of pinned inputs permitted (boundary check).
    pub max_inputs: usize,
}

impl EnvironmentConfig {
    pub fn new(environment: Environment, inputs: Vec<PinnedInput>) -> Self {
        Self {
            environment,
            inputs,
            max_inputs: 64,
        }
    }

    /// Deterministic artifact identity derived from the environment and pinned
    /// inputs. Inputs are sorted so ordering does not affect the identity.
    pub fn artifact_identity(&self) -> String {
        let mut sorted: Vec<&PinnedInput> = self.inputs.iter().collect();
        sorted.sort_by(|a, b| a.name.cmp(&b.name).then(a.version.cmp(&b.version)));

        let mut hasher = Fnv1a::new();
        hasher.write(self.environment.as_str().as_bytes());
        for input in sorted {
            hasher.write(b"\0");
            hasher.write(input.name.as_bytes());
            hasher.write(b"=");
            hasher.write(input.version.as_bytes());
        }
        format!("{:016x}", hasher.finish())
    }

    /// Validate the configuration without a release approval.
    pub fn validate(&self) -> Result<String, ConfigError> {
        self.validate_with_approval(None, &[])
    }

    /// Validate the configuration, enforcing approval gating and replay
    /// protection for environments that require it.
    pub fn validate_with_approval(
        &self,
        approval: Option<&Approval>,
        used_nonces: &[u64],
    ) -> Result<String, ConfigError> {
        if self.inputs.is_empty() {
            return Err(ConfigError::MissingInput("<none>".to_string()));
        }
        if self.inputs.len() > self.max_inputs {
            return Err(ConfigError::BoundaryViolation(format!(
                "{} inputs exceed max {}",
                self.inputs.len(),
                self.max_inputs
            )));
        }

        let mut seen: BTreeMap<&str, &str> = BTreeMap::new();
        for input in &self.inputs {
            if input.name.trim().is_empty() {
                return Err(ConfigError::MissingInput(input.name.clone()));
            }
            if input.version.trim().is_empty() {
                return Err(ConfigError::EmptyVersion(input.name.clone()));
            }
            if let Some(prev) = seen.insert(input.name.as_str(), input.version.as_str()) {
                if prev != input.version {
                    return Err(ConfigError::BoundaryViolation(format!(
                        "conflicting versions for {}",
                        input.name
                    )));
                }
            }
        }

        if self.environment.requires_approval() {
            let approval = approval.ok_or(ConfigError::ApprovalRequired)?;
            if approval.approver.trim().is_empty() {
                return Err(ConfigError::Unauthorized(approval.approver.clone()));
            }
            if used_nonces.contains(&approval.nonce) {
                return Err(ConfigError::Replay {
                    nonce: approval.nonce,
                });
            }
        }

        Ok(self.artifact_identity())
    }
}

/// A registry of approved configurations supporting rollback.
#[derive(Debug, Default)]
pub struct ReleaseRegistry {
    approved: BTreeMap<Environment, Vec<String>>,
}

impl ReleaseRegistry {
    pub fn new() -> Self {
        Self {
            approved: BTreeMap::new(),
        }
    }

    /// Record an approved artifact identity for an environment.
    pub fn approve(&mut self, environment: Environment, identity: String) {
        self.approved.entry(environment).or_default().push(identity);
    }

    /// The currently active (latest approved) identity for an environment.
    pub fn current(&self, environment: Environment) -> Option<&str> {
        self.approved
            .get(&environment)
            .and_then(|v| v.last())
            .map(|s| s.as_str())
    }

    /// Roll back to the previous approved identity, returning it.
    pub fn rollback(&mut self, environment: Environment) -> Option<String> {
        let versions = self.approved.get_mut(&environment)?;
        if versions.len() < 2 {
            return None;
        }
        versions.pop();
        versions.last().cloned()
    }
}

/// Minimal deterministic FNV-1a hasher for stable artifact identities.
struct Fnv1a {
    state: u64,
}

impl Fnv1a {
    const OFFSET: u64 = 0xcbf29ce484222325;
    const PRIME: u64 = 0x100000001b3;

    fn new() -> Self {
        Self {
            state: Self::OFFSET,
        }
    }

    fn write(&mut self, bytes: &[u8]) {
        for b in bytes {
            self.state ^= *b as u64;
            self.state = self.state.wrapping_mul(Self::PRIME);
        }
    }

    fn finish(&self) -> u64 {
        self.state
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(env: Environment) -> EnvironmentConfig {
        EnvironmentConfig::new(
            env,
            vec![
                PinnedInput::new("rustc", "1.79.0"),
                PinnedInput::new("soroban-sdk", "21.0.0"),
            ],
        )
    }

    #[test]
    fn success_local_validation() {
        let cfg = sample(Environment::Local);
        let id = cfg.validate().expect("local config should validate");
        assert_eq!(id, cfg.artifact_identity());
    }

    #[test]
    fn artifact_identity_is_order_independent() {
        let a = EnvironmentConfig::new(
            Environment::Testnet,
            vec![
                PinnedInput::new("rustc", "1.79.0"),
                PinnedInput::new("soroban-sdk", "21.0.0"),
            ],
        );
        let b = EnvironmentConfig::new(
            Environment::Testnet,
            vec![
                PinnedInput::new("soroban-sdk", "21.0.0"),
                PinnedInput::new("rustc", "1.79.0"),
            ],
        );
        assert_eq!(a.artifact_identity(), b.artifact_identity());
    }

    #[test]
    fn boundary_too_many_inputs() {
        let mut cfg = sample(Environment::Local);
        cfg.max_inputs = 1;
        assert!(matches!(
            cfg.validate(),
            Err(ConfigError::BoundaryViolation(_))
        ));
    }

    #[test]
    fn boundary_empty_version() {
        let cfg = EnvironmentConfig::new(
            Environment::Local,
            vec![PinnedInput::new("rustc", "")],
        );
        assert_eq!(
            cfg.validate(),
            Err(ConfigError::EmptyVersion("rustc".to_string()))
        );
    }

    #[test]
    fn failure_missing_inputs() {
        let cfg = EnvironmentConfig::new(Environment::Local, vec![]);
        assert!(matches!(cfg.validate(), Err(ConfigError::MissingInput(_))));
    }

    #[test]
    fn mainnet_requires_approval() {
        let cfg = sample(Environment::Mainnet);
        assert_eq!(cfg.validate(), Err(ConfigError::ApprovalRequired));
    }

    #[test]
    fn unauthorized_approver_rejected() {
        let cfg = sample(Environment::Mainnet);
        let approval = Approval {
            approver: "  ".to_string(),
            nonce: 1,
        };
        assert!(matches!(
            cfg.validate_with_approval(Some(&approval), &[]),
            Err(ConfigError::Unauthorized(_))
        ));
    }

    #[test]
    fn replay_nonce_rejected() {
        let cfg = sample(Environment::Mainnet);
        let approval = Approval {
            approver: "release-bot".to_string(),
            nonce: 42,
        };
        assert!(cfg.validate_with_approval(Some(&approval), &[]).is_ok());
        assert_eq!(
            cfg.validate_with_approval(Some(&approval), &[42]),
            Err(ConfigError::Replay { nonce: 42 })
        );
    }

    #[test]
    fn rollback_returns_previous_identity() {
        let mut registry = ReleaseRegistry::new();
        registry.approve(Environment::Mainnet, "aaa".to_string());
        registry.approve(Environment::Mainnet, "bbb".to_string());
        assert_eq!(registry.current(Environment::Mainnet), Some("bbb"));
        assert_eq!(
            registry.rollback(Environment::Mainnet),
            Some("aaa".to_string())
        );
        assert_eq!(registry.current(Environment::Mainnet), Some("aaa"));
        assert_eq!(registry.rollback(Environment::Mainnet), None);
    }
}
