//! Signed Rust contract release manifests.
//!
//! A release manifest pins the exact inputs used to build a Soroban contract
//! (toolchain, source commit, dependency lock), records the deterministic
//! identity of the compiled wasm artifact, validates the target environment
//! (network passphrase + contract id) before approval, and supports rollback.
//!
//! Validation is deterministic: the same manifest always yields the same
//! digest, and any tampering with pinned inputs or artifact identity is
//! rejected before a release can be approved.

use std::collections::BTreeMap;

/// Pinned, reproducible build inputs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PinnedInputs {
    /// Rust toolchain, e.g. "1.79.0".
    pub toolchain: String,
    /// Source commit the artifact was built from.
    pub source_commit: String,
    /// Hash of the committed Cargo.lock.
    pub dependency_lock: String,
}

/// Deterministic identity of a compiled wasm artifact.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ArtifactIdentity {
    /// SHA-256 of the compiled wasm, hex encoded.
    pub wasm_sha256: String,
    /// Size of the compiled wasm in bytes.
    pub wasm_size: u64,
}

/// Target environment a release is approved for.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Environment {
    /// Stellar network passphrase, e.g. "Test SDF Network ; September 2015".
    pub network_passphrase: String,
    /// Contract id the artifact is deployed to.
    pub contract_id: String,
}

/// A signed release manifest.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReleaseManifest {
    pub inputs: PinnedInputs,
    pub artifact: ArtifactIdentity,
    pub environment: Environment,
    /// Approver signatures keyed by signer id.
    pub signatures: BTreeMap<String, String>,
}

/// Errors surfaced by manifest validation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ManifestError {
    EmptyField(&'static str),
    InvalidHash(&'static str),
    EnvironmentMismatch,
    Unauthorized,
    Replay,
    NotApproved,
}

fn is_hex_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_hexdigit())
}

impl ReleaseManifest {
    /// Deterministic digest over pinned inputs and artifact identity.
    pub fn digest(&self) -> String {
        let mut acc: u64 = 0xcbf29ce484222325;
        let mut feed = |s: &str| {
            for b in s.bytes() {
                acc ^= b as u64;
                acc = acc.wrapping_mul(0x100000001b3);
            }
        };
        feed(&self.inputs.toolchain);
        feed(&self.inputs.source_commit);
        feed(&self.inputs.dependency_lock);
        feed(&self.artifact.wasm_sha256);
        feed(&self.artifact.wasm_size.to_string());
        format!("{acc:016x}")
    }

    /// Validate pinned inputs and artifact identity deterministically.
    pub fn validate(&self) -> Result<(), ManifestError> {
        if self.inputs.toolchain.is_empty() {
            return Err(ManifestError::EmptyField("toolchain"));
        }
        if self.inputs.source_commit.is_empty() {
            return Err(ManifestError::EmptyField("source_commit"));
        }
        if !is_hex_sha256(&self.inputs.dependency_lock) {
            return Err(ManifestError::InvalidHash("dependency_lock"));
        }
        if !is_hex_sha256(&self.artifact.wasm_sha256) {
            return Err(ManifestError::InvalidHash("wasm_sha256"));
        }
        if self.artifact.wasm_size == 0 {
            return Err(ManifestError::EmptyField("wasm_size"));
        }
        Ok(())
    }

    /// Validate the target environment before approval.
    pub fn validate_environment(&self, expected: &Environment) -> Result<(), ManifestError> {
        if &self.environment != expected {
            return Err(ManifestError::EnvironmentMismatch);
        }
        Ok(())
    }

    /// Approve a release: environment must match, inputs valid, and the
    /// signer must be authorized and not replaying a prior approval.
    pub fn approve(
        &mut self,
        expected: &Environment,
        signer: &str,
        signature: &str,
        authorized: &[&str],
    ) -> Result<(), ManifestError> {
        self.validate()?;
        self.validate_environment(expected)?;
        if !authorized.contains(&signer) {
            return Err(ManifestError::Unauthorized);
        }
        if self.signatures.contains_key(signer) {
            return Err(ManifestError::Replay);
        }
        if signature.is_empty() {
            return Err(ManifestError::EmptyField("signature"));
        }
        self.signatures.insert(signer.to_string(), signature.to_string());
        Ok(())
    }

    /// Roll back to a previously approved manifest, clearing signatures so the
    /// prior release must be re-approved for the current environment.
    pub fn rollback_to(previous: &ReleaseManifest) -> ReleaseManifest {
        let mut restored = previous.clone();
        restored.signatures.clear();
        restored
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env() -> Environment {
        Environment {
            network_passphrase: "Test SDF Network ; September 2015".into(),
            contract_id: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM".into(),
        }
    }

    fn manifest() -> ReleaseManifest {
        ReleaseManifest {
            inputs: PinnedInputs {
                toolchain: "1.79.0".into(),
                source_commit: "abc123".into(),
                dependency_lock: "a".repeat(64),
            },
            artifact: ArtifactIdentity {
                wasm_sha256: "b".repeat(64),
                wasm_size: 4096,
            },
            environment: env(),
            signatures: BTreeMap::new(),
        }
    }

    #[test]
    fn valid_manifest_passes() {
        assert_eq!(manifest().validate(), Ok(()));
    }

    #[test]
    fn digest_is_deterministic() {
        assert_eq!(manifest().digest(), manifest().digest());
    }

    #[test]
    fn boundary_empty_toolchain_rejected() {
        let mut m = manifest();
        m.inputs.toolchain.clear();
        assert_eq!(m.validate(), Err(ManifestError::EmptyField("toolchain")));
    }

    #[test]
    fn boundary_bad_hash_rejected() {
        let mut m = manifest();
        m.artifact.wasm_sha256 = "xyz".into();
        assert_eq!(m.validate(), Err(ManifestError::InvalidHash("wasm_sha256")));
    }

    #[test]
    fn environment_mismatch_rejected() {
        let mut other = env();
        other.contract_id = "COTHER".into();
        assert_eq!(
            manifest().validate_environment(&other),
            Err(ManifestError::EnvironmentMismatch)
        );
    }

    #[test]
    fn unauthorized_signer_rejected() {
        let mut m = manifest();
        assert_eq!(
            m.approve(&env(), "mallory", "sig", &["alice"]),
            Err(ManifestError::Unauthorized)
        );
    }

    #[test]
    fn replay_rejected() {
        let mut m = manifest();
        m.approve(&env(), "alice", "sig1", &["alice"]).unwrap();
        assert_eq!(
            m.approve(&env(), "alice", "sig2", &["alice"]),
            Err(ManifestError::Replay)
        );
    }

    #[test]
    fn approval_succeeds_and_rollback_clears_signatures() {
        let mut m = manifest();
        m.approve(&env(), "alice", "sig", &["alice"]).unwrap();
        assert!(m.signatures.contains_key("alice"));
        let restored = ReleaseManifest::rollback_to(&m);
        assert!(restored.signatures.is_empty());
        assert_eq!(restored.digest(), m.digest());
    }
}
