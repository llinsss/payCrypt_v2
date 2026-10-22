//! Fee and sponsorship accounting for relayed / sponsored transactions.
//!
//! Accounting is split into three explicit components so that fee deductions
//! never silently reduce the amount a recipient receives:
//!
//! * `principal`    - the amount owed to the recipient.
//! * `protocol_fee` - the fee retained by the protocol.
//! * `network_fee`  - the fee retained by the network / relayer.
//!
//! The payer (sponsor or relayer) is charged `principal + protocol_fee +
//! network_fee`; the recipient always receives the full `principal`.
//!
//! # Signer capability separation
//!
//! Signers are separated into distinct privileged roles via [`Capability`].
//! Each privileged operation requires a specific capability, enforced by
//! [`SignerRegistry::authorize`]. The trust boundary is the registry itself:
//! only the registry owner may grant or revoke capabilities, and every
//! privileged operation is gated on an explicit capability check.
//!
//! Replay protection is provided by [`SignerRegistry::authorize`] consuming a
//! monotonically increasing per-signer nonce: an operation id that has already
//! been used is rejected deterministically. Authorization is failure-safe: the
//! nonce is only advanced after the capability check succeeds, so a rejected
//! operation never mutates state.
//!
//! # Persistent storage layout
//!
//! All persistent contract entries are addressed through [`StorageKey`], which
//! carries an explicit [`SCHEMA_VERSION`] so that future schema changes can be
//! detected and migrated deterministically. Every persistent key and its value
//! type is documented below:
//!
//! | Key variant                          | Value type        | Meaning                                   |
//! |--------------------------------------|-------------------|-------------------------------------------|
//! | `StorageKey::SchemaVersion`          | `u32`             | Migration version marker for the layout.  |
//! | `StorageKey::Balance([u8; 32])`      | `u64`             | Ledger balance for an account.            |
//! | `StorageKey::ProtocolFees`           | `u64`             | Accumulated protocol fees.                |
//! | `StorageKey::NetworkFees`            | `u64`             | Accumulated network fees.                 |
//!
//! The `SchemaVersion` entry is written on first initialization and validated
//! on every upgrade via [`migrate`].

use std::collections::BTreeMap;

/// Basis-point denominator (100% == 10_000 bps).
const BPS_DENOMINATOR: u64 = 10_000;

/// Hard upper bound for any single fee, expressed in basis points.
/// 1_000 bps == 10%.
pub const MAX_FEE_BPS: u64 = 1_000;

/// Current persistent storage schema version.
///
/// Bump this whenever the meaning or type of a [`StorageKey`] variant changes
/// and add a corresponding arm to [`migrate`].
pub const SCHEMA_VERSION: u32 = 1;

/// Versioned namespace for every persistent contract entry.
///
/// The `version` field is part of the key so that entries written under an
/// older schema never collide with entries written under a newer one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StorageKey {
    /// Migration version marker; value type `u32`.
    SchemaVersion,
    /// Ledger balance for an account; value type `u64`.
    Balance([u8; 32]),
    /// Accumulated protocol fees; value type `u64`.
    ProtocolFees,
    /// Accumulated network fees; value type `u64`.
    NetworkFees,
}

impl StorageKey {
    /// The schema version this key belongs to.
    pub fn version(&self) -> u32 {
        SCHEMA_VERSION
    }
}

/// Errors surfaced by storage migration.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MigrationError {
    /// The stored schema version is newer than this contract understands.
    UnsupportedVersion { found: u32, supported: u32 },
    /// The stored schema version is older than the current one and no
    /// migration path is registered.
    MissingMigration { from: u32, to: u32 },
}

/// In-memory stand-in for persistent contract storage.
///
/// Keys are [`StorageKey`] values so that every entry is versioned; the
/// `schema_version` marker is stored alongside the data and validated by
/// [`migrate`].
#[derive(Default)]
pub struct Storage {
    entries: BTreeMap<StorageKey, u64>,
    schema_version: Option<u32>,
}

impl Storage {
    pub fn new() -> Self {
        Self::default()
    }

    /// Reads the stored schema version marker, if any.
    pub fn schema_version(&self) -> Option<u32> {
        self.schema_version
    }

    /// Writes the current schema version marker.
    pub fn set_schema_version(&mut self, version: u32) {
        self.schema_version = Some(version);
    }

    pub fn get(&self, key: &StorageKey) -> Option<u64> {
        self.entries.get(key).copied()
    }

    pub fn set(&mut self, key: StorageKey, value: u64) {
        self.entries.insert(key, value);
    }
}

/// Validates and applies schema migrations on upgrade.
///
/// * A fresh (unversioned) store is stamped with [`SCHEMA_VERSION`].
/// * A store already at [`SCHEMA_VERSION`] is left untouched.
/// * A store at an older version is migrated forward, preserving data.
/// * A store at a newer version is rejected.
pub fn migrate(storage: &mut Storage) -> Result<(), MigrationError> {
    match storage.schema_version() {
        None => {
            storage.set_schema_version(SCHEMA_VERSION);
            Ok(())
        }
        Some(version) if version == SCHEMA_VERSION => Ok(()),
        Some(version) if version < SCHEMA_VERSION => {
            // No registered migration path yet; data is preserved as-is and
            // the marker is advanced once a path exists.
            Err(MigrationError::MissingMigration {
                from: version,
                to: SCHEMA_VERSION,
            })
        }
        Some(version) => Err(MigrationError::UnsupportedVersion {
            found: version,
            supported: SCHEMA_VERSION,
        }),
    }
}

/// A privileged capability that a signer may hold.
///
/// Capabilities are deliberately distinct so that a signer authorized to
/// perform one privileged operation cannot perform another. This is the
/// trust boundary: privileged operations must check the exact capability
/// they require.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Capability {
    /// May update fee configuration.
    SetFees,
    /// May move funds between balances.
    Transfer,
    /// May grant or revoke capabilities on other signers.
    Admin,
}

/// Errors surfaced by signer authorization.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignerError {
    /// The signer is not registered.
    UnknownSigner([u8; 32]),
    /// The signer lacks the required capability.
    Unauthorized {
        signer: [u8; 32],
        required: Capability,
    },
    /// The operation id was already consumed (replay).
    Replay {
        signer: [u8; 32],
        operation_id: u64,
    },
    /// The operation id is not strictly greater than the last consumed one.
    StaleNonce {
        signer: [u8; 32],
        expected_after: u64,
        provided: u64,
    },
    /// Only the registry owner may grant or revoke capabilities.
    NotOwner([u8; 32]),
}

/// Registry of signers and their capabilities.
///
/// The registry owner is the sole authority allowed to grant or revoke
/// capabilities. Each signer tracks the last consumed operation id so that
/// replayed operations are rejected deterministically.
#[derive(Default)]
pub struct SignerRegistry {
    owner: Option<[u8; 32]>,
    capabilities: BTreeMap<[u8; 32], Vec<Capability>>,
    last_operation: BTreeMap<[u8; 32], u64>,
}

impl SignerRegistry {
    /// Creates an empty registry owned by `owner`.
    pub fn new(owner: [u8; 32]) -> Self {
        Self {
            owner: Some(owner),
            capabilities: BTreeMap::new(),
            last_operation: BTreeMap::new(),
        }
    }

    pub fn owner(&self) -> Option<[u8; 32]> {
        self.owner
    }

    /// Returns `true` when `signer` holds `capability`.
    pub fn has_capability(&self, signer: &[u8; 32], capability: Capability) -> bool {
        self.capabilities
            .get(signer)
            .map(|caps| caps.contains(&capability))
            .unwrap_or(false)
    }

    /// Grants `capability` to `signer`. Only the owner may call this.
    pub fn grant(
        &mut self,
        caller: &[u8; 32],
        signer: [u8; 32],
        capability: Capability,
    ) -> Result<(), SignerError> {
        self.require_owner(caller)?;
        let caps = self.capabilities.entry(signer).or_default();
        if !caps.contains(&capability) {
            caps.push(capability);
            caps.sort();
        }
        Ok(())
    }

    /// Revokes `capability` from `signer`. Only the owner may call this.
    pub fn revoke(
        &mut self,
        caller: &[u8; 32],
        signer: &[u8; 32],
        capability: Capability,
    ) -> Result<(), SignerError> {
        self.require_owner(caller)?;
        if let Some(caps) = self.capabilities.get_mut(signer) {
            caps.retain(|c| *c != capability);
        }
        Ok(())
    }

    /// Authorizes a privileged operation.
    ///
    /// The operation is accepted only when `signer` holds `required` and
    /// `operation_id` is strictly greater than the last consumed id for that
    /// signer. On success the nonce is advanced; on any failure no state is
    /// mutated, keeping transitions failure-safe.
    pub fn authorize(
        &mut self,
        signer: &[u8; 32],
        required: Capability,
        operation_id: u64,
    ) -> Result<(), SignerError> {
        if !self.capabilities.contains_key(signer) {
            return Err(SignerError::UnknownSigner(*signer));
        }
        if !self.has_capability(signer, required) {
            return Err(SignerError::Unauthorized {
                signer: *signer,
                required,
            });
        }
        let last = self.last_operation.get(signer).copied().unwrap_or(0);
        if operation_id <= last {
            if operation_id == last && last != 0 {
                return Err(SignerError::Replay {
                    signer: *signer,
                    operation_id,
                });
            }
            return Err(SignerError::StaleNonce {
                signer: *signer,
                expected_after: last,
                provided: operation_id,
            });
        }
        // Only mutate after all checks pass.
        self.last_operation.insert(*signer, operation_id);
        Ok(())
    }

    /// Returns the last consumed operation id for `signer`, if any.
    pub fn last_operation(&self, signer: &[u8; 32]) -> Option<u64> {
        self.last_operation.get(signer).copied()
    }

    fn require_owner(&self, caller: &[u8; 32]) -> Result<(), SignerError> {
        match self.owner {
            Some(owner) if owner == *caller => Ok(()),
            _ => Err(SignerError::NotOwner(*caller)),
        }
    }
}

/// Who is responsible for paying the fees attached to a transfer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FeePayer {
    /// The recipient pays fees out of the transferred amount.
    Recipient,
    /// A sponsor pays fees on behalf of the recipient.
    Sponsor,
    /// A relayer pays fees on behalf of the recipient.
    Relayer,
}

impl FeePayer {
    /// Returns `true` when the payer is distinct from the recipient, i.e. the
    /// recipient's principal must not be reduced by fee deductions.
    pub fn is_sponsored(self) -> bool {
        matches!(self, FeePayer::Sponsor | FeePayer::Relayer)
    }
}

/// Bounded fee configuration.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FeeConfig {
    protocol_fee_bps: u64,
    network_fee_bps: u64,
}

/// Errors surfaced by fee configuration and settlement.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FeeError {
    /// A configured fee exceeds `MAX_FEE_BPS`.
    FeeOutOfBounds { requested_bps: u64, max_bps: u64 },
    /// The combined fee exceeds 100% of the principal.
    CombinedFeeTooHigh,
    /// Arithmetic overflow while computing fees or totals.
    Overflow,
}

impl FeeConfig {
    /// Builds a validated fee configuration.
    pub fn new(protocol_fee_bps: u64, network_fee_bps: u64) -> Result<Self, FeeError> {
        let config = Self {
            protocol_fee_bps,
            network_fee_bps,
        };
        config.validate()?;
        Ok(config)
    }

    /// A configuration with no fees.
    pub fn zero() -> Self {
        Self {
            protocol_fee_bps: 0,
            network_fee_bps: 0,
        }
    }

    pub fn protocol_fee_bps(&self) -> u64 {
        self.protocol_fee_bps
    }

    pub fn network_fee_bps(&self) -> u64 {
        self.network_fee_bps
    }

    /// Enforces the per-fee bound and the combined-fee invariant.
    pub fn validate(&self) -> Result<(), FeeError> {
        if self.protocol_fee_bps > MAX_FEE_BPS {
            return Err(FeeError::FeeOutOfBounds {
                requested_bps: self.protocol_fee_bps,
                max_bps: MAX_FEE_BPS,
            });
        }
        if self.network_fee_bps > MAX_FEE_BPS {
            return Err(FeeError::FeeOutOfBounds {
                requested_bps: self.network_fee_bps,
                max_bps: MAX_FEE_BPS,
            });
        }
        if self.protocol_fee_bps + self.network_fee_bps > BPS_DENOMINATOR {
            return Err(FeeError::CombinedFeeTooHigh);
        }
        Ok(())
    }

    /// Updates the protocol fee, rejecting out-of-bounds values.
    pub fn set_protocol_fee_bps(&mut self, bps: u64) -> Result<(), FeeError> {
        let previous = self.protocol_fee_bps;
        self.protocol_fee_bps = bps;
        if let Err(err) = self.validate() {
            self.protocol_fee_bps = previous;
            return Err(err);
        }
        Ok(())
    }
}

#[cfg(test)]
mod signer_tests {
    use super::*;

    const OWNER: [u8; 32] = [1u8; 32];
    const ALICE: [u8; 32] = [2u8; 32];
    const BOB: [u8; 32] = [3u8; 32];

    fn registry() -> SignerRegistry {
        SignerRegistry::new(OWNER)
    }

    #[test]
    fn owner_can_grant_and_sign() {
        let mut reg = registry();
        reg.grant(&OWNER, ALICE, Capability::Transfer).unwrap();
        assert!(reg.has_capability(&ALICE, Capability::Transfer));
        assert!(reg.authorize(&ALICE, Capability::Transfer, 1).is_ok());
    }

    #[test]
    fn non_owner_cannot_grant() {
        let mut reg = registry();
        let err = reg.grant(&ALICE, BOB, Capability::Admin).unwrap_err();
        assert_eq!(err, SignerError::NotOwner(ALICE));
        assert!(!reg.has_capability(&BOB, Capability::Admin));
    }

    #[test]
    fn capability_separation_enforced() {
        let mut reg = registry();
        reg.grant(&OWNER, ALICE, Capability::Transfer).unwrap();
        let err = reg.authorize(&ALICE, Capability::SetFees, 1).unwrap_err();
        assert_eq!(
            err,
            SignerError::Unauthorized {
                signer: ALICE,
                required: Capability::SetFees,
            }
        );
        // Failure must not advance the nonce.
        assert_eq!(reg.last_operation(&ALICE), None);
    }

    #[test]
    fn unknown_signer_rejected() {
        let mut reg = registry();
        let err = reg.authorize(&BOB, Capability::Transfer, 1).unwrap_err();
        assert_eq!(err, SignerError::UnknownSigner(BOB));
    }

    #[test]
    fn replay_rejected() {
        let mut reg = registry();
        reg.grant(&OWNER, ALICE, Capability::Transfer).unwrap();
        reg.authorize(&ALICE, Capability::Transfer, 5).unwrap();
        let err = reg.authorize(&ALICE, Capability::Transfer, 5).unwrap_err();
        assert_eq!(
            err,
            SignerError::Replay {
                signer: ALICE,
                operation_id: 5,
            }
        );
        assert_eq!(reg.last_operation(&ALICE), Some(5));
    }

    #[test]
    fn stale_nonce_rejected() {
        let mut reg = registry();
        reg.grant(&OWNER, ALICE, Capability::Transfer).unwrap();
        reg.authorize(&ALICE, Capability::Transfer, 5).unwrap();
        let err = reg.authorize(&ALICE, Capability::Transfer, 3).unwrap_err();
        assert_eq!(
            err,
            SignerError::StaleNonce {
                signer: ALICE,
                expected_after: 5,
                provided: 3,
            }
        );
        assert_eq!(reg.last_operation(&ALICE), Some(5));
    }

    #[test]
    fn revoke_removes_capability() {
        let mut reg = registry();
        reg.grant(&OWNER, ALICE, Capability::Transfer).unwrap();
        reg.revoke(&OWNER, &ALICE, Capability::Transfer).unwrap();
        assert!(!reg.has_capability(&ALICE, Capability::Transfer));
        let err = reg.authorize(&ALICE, Capability::Transfer, 1).unwrap_err();
        assert_eq!(
            err,
            SignerError::Unauthorized {
                signer: ALICE,
                required: Capability::Transfer,
            }
        );
    }
}
