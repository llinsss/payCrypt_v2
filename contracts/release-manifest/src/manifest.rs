//! Signed Rust contract release manifests.
//!
//! A release manifest pins the exact inputs used to build a Soroban contract
//! (toolchain, source commit, dependency lock), records the deterministic
//! identity of the produced wasm artifact, and captures the environment the
//! release is approved for. Manifests are signed so that release approval and
//! rollback can be verified deterministically.

use std::collections::BTreeMap;
use std::fmt;

/// Errors produced while building or validating a release manifest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ManifestError {
    /// A required field was empty or otherwise malformed.
    InvalidField(&'static str),
    /// The artifact hash was not a 64-char lowercase hex sha256 digest.
    InvalidArtifactHash,
    /// The manifest signature did not verify against the expected signer.
    InvalidSignature,
    /// The manifest was approved for a different environment than the target.
    EnvironmentMismatch,
    /// The manifest was already approved; replay is rejected.
    Replay,
}

impl fmt::Display for ManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ManifestError::InvalidField(name) => write!(f, "invalid manifest field: {name}"),
            ManifestError::InvalidArtifactHash => write!(f, "artifact hash must be 64-char lowercase hex"),
            ManifestError::InvalidSignature => write!(f, "manifest signature did not verify"),
            ManifestError::EnvironmentMismatch => write!(f, "manifest environment does not match target"),
            ManifestError::Replay => write!(f, "manifest was already approved"),
        }
    }
}

impl std::error::Error for ManifestError {}

/// Pinned, reproducible build inputs for a contract release.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PinnedInputs {
    /// Rust toolchain, e.g. `1.79.0`.
    pub toolchain: String,
    /// Full source commit sha the artifact was built from.
    pub source_commit: String,
    /// sha256 of the committed `Cargo.lock`.
    pub dependency_lock_hash: String,
}

impl PinnedInputs {
    /// Deterministically validate that every pinned input is present and well formed.
    pub fn validate(&self) -> Result<(), ManifestError> {
        if self.toolchain.trim().is_empty() {
            return Err(ManifestError::InvalidField("toolchain"));
        }
        if !is_hex(&self.source_commit, 40) {
            return Err(ManifestError::InvalidField("source_commit"));
        }
        if !is_hex(&self.dependency_lock_hash, 64) {
            return Err(ManifestError::InvalidField("dependency_lock_hash"));
        }
        Ok(())
    }
}

/// Deterministic identity of a compiled wasm artifact.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArtifactIdentity {
    /// sha256 of the compiled wasm bytes.
    pub wasm_sha256: String,
    /// Size of the compiled wasm in bytes.
    pub wasm_size: u64,
}

impl ArtifactIdentity {
    /// Build an identity from raw wasm bytes using a deterministic sha256.
    pub fn from_wasm(bytes: &[u8]) -> Self {
        ArtifactIdentity {
            wasm_sha256: sha256_hex(bytes),
            wasm_size: bytes.len() as u64,
        }
    }

    /// Validate the artifact identity is a well formed sha256 digest.
    pub fn validate(&self) -> Result<(), ManifestError> {
        if !is_hex(&self.wasm_sha256, 64) {
            return Err(ManifestError::InvalidArtifactHash);
        }
        Ok(())
    }
}

/// Target environment a release is approved for.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Environment {
    /// Stellar network passphrase, e.g. `Test SDF Network ; September 2015`.
    pub network_passphrase: String,
    /// Contract id (strkey `C...`) the release targets.
    pub contract_id: String,
}

impl Environment {
    /// Validate the environment is fully specified.
    pub fn validate(&self) -> Result<(), ManifestError> {
        if self.network_passphrase.trim().is_empty() {
            return Err(ManifestError::InvalidField("network_passphrase"));
        }
        if !self.contract_id.starts_with('C') || self.contract_id.len() != 56 {
            return Err(ManifestError::InvalidField("contract_id"));
        }
        Ok(())
    }
}

/// A signed release manifest binding pinned inputs, artifact identity and environment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseManifest {
    /// Monotonic release version for the contract.
    pub version: u32,
    /// Pinned reproducible build inputs.
    pub inputs: PinnedInputs,
    /// Deterministic artifact identity.
    pub artifact: ArtifactIdentity,
    /// Environment the release is approved for.
    pub environment: Environment,
    /// Signature over the canonical manifest digest.
    pub signature: String,
}

impl ReleaseManifest {
    /// Canonical, deterministic byte encoding used for signing and verification.
    pub fn canonical_digest(&self) -> String {
        let mut fields: BTreeMap<&str, String> = BTreeMap::new();
        fields.insert("version", self.version.to_string());
        fields.insert("toolchain", self.inputs.toolchain.clone());
        fields.insert("source_commit", self.inputs.source_commit.clone());
        fields.insert("dependency_lock_hash", self.inputs.dependency_lock_hash.clone());
        fields.insert("wasm_sha256", self.artifact.wasm_sha256.clone());
        fields.insert("wasm_size", self.artifact.wasm_size.to_string());
        fields.insert("network_passphrase", self.environment.network_passphrase.clone());
        fields.insert("contract_id", self.environment.contract_id.clone());

        let mut canonical = String::new();
        for (key, value) in fields {
            canonical.push_str(key);
            canonical.push('=');
            canonical.push_str(&value);
            canonical.push('\n');
        }
        sha256_hex(canonical.as_bytes())
    }

    /// Validate all manifest fields deterministically.
    pub fn validate(&self) -> Result<(), ManifestError> {
        self.inputs.validate()?;
        self.artifact.validate()?;
        self.environment.validate()?;
        if self.signature.trim().is_empty() {
            return Err(ManifestError::InvalidSignature);
        }
        Ok(())
    }

    /// Verify the manifest signature against the expected signer digest.
    ///
    /// The signature is the sha256 of `signer || canonical_digest`, which keeps
    /// verification deterministic and dependency free.
    pub fn verify_signature(&self, signer: &str) -> Result<(), ManifestError> {
        self.validate()?;
        let expected = sha256_hex(format!("{signer}{}", self.canonical_digest()).as_bytes());
        if constant_time_eq(&expected, &self.signature) {
            Ok(())
        } else {
            Err(ManifestError::InvalidSignature)
        }
    }

    /// Approve the release for a target environment, rejecting replay and mismatches.
    pub fn approve(&self, target: &Environment, signer: &str) -> Result<(), ManifestError> {
        if self.environment != *target {
            return Err(ManifestError::EnvironmentMismatch);
        }
        self.verify_signature(signer)?;
        Ok(())
    }
}

/// Tracks approved releases so replay and rollback are deterministic.
#[derive(Debug, Default, Clone)]
pub struct ReleaseLedger {
    approved: BTreeMap<String, u32>,
}

impl ReleaseLedger {
    /// Record an approved manifest, rejecting replays of the same artifact.
    pub fn approve(&mut self, manifest: &ReleaseManifest, target: &Environment, signer: &str) -> Result<(), ManifestError> {
        manifest.approve(target, signer)?;
        let key = manifest.artifact.wasm_sha256.clone();
        if self.approved.contains_key(&key) {
            return Err(ManifestError::Replay);
        }
        self.approved.insert(key, manifest.version);
        Ok(())
    }

    /// Roll back to a previously approved artifact hash.
    pub fn rollback(&mut self, wasm_sha256: &str) -> Result<u32, ManifestError> {
        match self.approved.get(wasm_sha256) {
            Some(version) => Ok(*version),
            None => Err(ManifestError::InvalidArtifactHash),
        }
    }
}

/// Returns true when `value` is exactly `len` lowercase hex characters.
fn is_hex(value: &str, len: usize) -> bool {
    value.len() == len && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Constant-time comparison to avoid leaking signature bytes via timing.
fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.bytes().zip(b.bytes()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// Minimal deterministic sha256 implementation (no external dependencies).
fn sha256_hex(input: &[u8]) -> String {
    let digest = sha256(input);
    let mut out = String::with_capacity(64);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

const K: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

fn sha256(input: &[u8]) -> [u8; 32] {
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];

    let mut message = input.to_vec();
    let bit_len = (input.len() as u64) * 8;
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in message.chunks(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([chunk[i * 4], chunk[i * 4 + 1], chunk[i * 4 + 2], chunk[i * 4 + 3]]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut out = [0u8; 32];
    for (i, word) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn env() -> Environment {
        Environment {
            network_passphrase: "Test SDF Network ; September 2015".to_string(),
            contract_id: format!("C{}", "A".repeat(55)),
        }
    }

    fn inputs() -> PinnedInputs {
        PinnedInputs {
            toolchain: "1.79.0".to_string(),
            source_commit: "a".repeat(40),
            dependency_lock_hash: "b".repeat(64),
        }
    }

    fn signed_manifest() -> ReleaseManifest {
        let mut manifest = ReleaseManifest {
            version: 1,
            inputs: inputs(),
            artifact: ArtifactIdentity::from_wasm(b"wasm-bytes"),
            environment: env(),
            signature: String::new(),
        };
        manifest.signature = sha256_hex(format!("signer{}", manifest.canonical_digest()).as_bytes());
        manifest
    }

    #[test]
    fn sha256_matches_known_vector() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn artifact_identity_is_deterministic() {
        let a = ArtifactIdentity::from_wasm(b"same");
        let b = ArtifactIdentity::from_wasm(b"same");
        assert_eq!(a, b);
        assert_eq!(a.wasm_size, 4);
    }

    #[test]
    fn valid_manifest_approves() {
        let manifest = signed_manifest();
        assert!(manifest.approve(&env(), "signer").is_ok());
    }

    #[test]
    fn rejects_environment_mismatch() {
        let manifest = signed_manifest();
        let mut other = env();
        other.contract_id = format!("C{}", "B".repeat(55));
        assert_eq!(manifest.approve(&other, "signer"), Err(ManifestError::EnvironmentMismatch));
    }

    #[test]
    fn rejects_unauthorized_signer() {
        let manifest = signed_manifest();
        assert_eq!(manifest.approve(&env(), "attacker"), Err(ManifestError::InvalidSignature));
    }

    #[test]
    fn rejects_replay() {
        let manifest = signed_manifest();
        let mut ledger = ReleaseLedger::default();
        assert!(ledger.approve(&manifest, &env(), "signer").is_ok());
        assert_eq!(ledger.approve(&manifest, &env(), "signer"), Err(ManifestError::Replay));
    }

    #[test]
    fn rollback_returns_approved_version() {
        let manifest = signed_manifest();
        let mut ledger = ReleaseLedger::default();
        ledger.approve(&manifest, &env(), "signer").unwrap();
        assert_eq!(ledger.rollback(&manifest.artifact.wasm_sha256), Ok(1));
        assert_eq!(ledger.rollback(&"0".repeat(64)), Err(ManifestError::InvalidArtifactHash));
    }

    #[test]
    fn rejects_malformed_inputs() {
        let mut manifest = signed_manifest();
        manifest.inputs.source_commit = "short".to_string();
        assert_eq!(manifest.validate(), Err(ManifestError::InvalidField("source_commit")));
    }

    #[test]
    fn rejects_malformed_artifact_hash() {
        let mut manifest = signed_manifest();
        manifest.artifact.wasm_sha256 = "XYZ".to_string();
        assert_eq!(manifest.validate(), Err(ManifestError::InvalidArtifactHash));
    }
}
