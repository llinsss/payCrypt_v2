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

    /// Updates the network fee, rejecting out-of-bounds values.
    pub fn set_network_fee_bps(&mut self, bps: u64) -> Result<(), FeeError> {
        let previous = self.network_fee_bps;
        self.network_fee_bps = bps;
        if let Err(err) = self.validate() {
            self.network_fee_bps = previous;
            return Err(err);
        }
        Ok(())
    }
}

/// Deterministic fee computation.
///
/// Fees are computed with integer arithmetic and round **down** (floor) so
/// that rounding can never push a fee above its configured bound and the
/// recipient's principal is never reduced by rounding.
fn fee_for(amount: u64, bps: u64) -> Result<u64, FeeError> {
    amount
        .checked_mul(bps)
        .map(|product| product / BPS_DENOMINATOR)
        .ok_or(FeeError::Overflow)
}

/// Fully separated accounting for a single transfer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FeeAccounting {
    /// Amount delivered to the recipient, untouched by fees.
    pub principal: u64,
    /// Fee retained by the protocol.
    pub protocol_fee: u64,
    /// Fee retained by the network / relayer.
    pub network_fee: u64,
    /// Total charged to the payer.
    pub total_charged: u64,
    /// Who pays the fees.
    pub payer: FeePayer,
}

impl FeeAccounting {
    /// Computes accounting for `principal` under `config`.
    ///
    /// When the payer is a sponsor or relayer, the recipient receives the
    /// full `principal` and the payer is charged `principal + fees`. When the
    /// recipient pays, fees are deducted from the principal and the payer is
    /// charged exactly `principal`.
    pub fn compute(
        principal: u64,
        config: &FeeConfig,
        payer: FeePayer,
    ) -> Result<Self, FeeError> {
        config.validate()?;

        let protocol_fee = fee_for(principal, config.protocol_fee_bps)?;
        let network_fee = fee_for(principal, config.network_fee_bps)?;
        let fees = protocol_fee
            .checked_add(network_fee)
            .ok_or(FeeError::Overflow)?;

        let total_charged = if payer.is_sponsored() {
            principal.checked_add(fees).ok_or(FeeError::Overflow)?
        } else {
            principal
        };

        Ok(Self {
            principal,
            protocol_fee,
            network_fee,
            total_charged,
            payer,
        })
    }

    /// Amount the recipient actually receives.
    ///
    /// Sponsored transfers deliver the full principal; recipient-paid
    /// transfers deliver principal minus the fees.
    pub fn recipient_amount(&self) -> Result<u64, FeeError> {
        if self.payer.is_sponsored() {
            return Ok(self.principal);
        }
        let fees = self
            .protocol_fee
            .checked_add(self.network_fee)
            .ok_or(FeeError::Overflow)?;
        self.principal.checked_sub(fees).ok_or(FeeError::Overflow)
    }
}

/// Minimal ledger used to settle transfers with separated accounting.
#[derive(Default)]
pub struct Ledger {
    balances: BTreeMap<[u8; 32], u64>,
    protocol_fees: u64,
    network_fees: u64,
}

impl Ledger {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn balance_of(&self, account: &[u8; 32]) -> u64 {
        *self.balances.get(account).unwrap_or(&0)
    }

    pub fn credit(&mut self, account: &[u8; 32], amount: u64) -> Result<(), FeeError> {
        let entry = self.balances.entry(*account).or_insert(0);
        *entry = entry.checked_add(amount).ok_or(FeeError::Overflow)?;
        Ok(())
    }

    pub fn protocol_fees(&self) -> u64 {
        self.protocol_fees
    }

    pub fn network_fees(&self) -> u64 {
        self.network_fees
    }

    /// Settles a transfer, charging the payer and crediting the recipient.
    ///
    /// The recipient is credited exactly `accounting.recipient_amount()`;
    /// fees are tracked separately and never mixed into the principal.
    pub fn settle(
        &mut self,
        payer_account: &[u8; 32],
        recipient_account: &[u8; 32],
        accounting: &FeeAccounting,
    ) -> Result<(), FeeError> {
        let payer_balance = self.balance_of(payer_account);
        let remaining = payer_balance
            .checked_sub(accounting.total_charged)
            .ok_or(FeeError::Overflow)?;
        self.balances.insert(*payer_account, remaining);

        let recipient_amount = accounting.recipient_amount()?;
        self.credit(recipient_account, recipient_amount)?;

        self.protocol_fees = self
            .protocol_fees
            .checked_add(accounting.protocol_fee)
            .ok_or(FeeError::Overflow)?;
        self.network_fees = self
            .network_fees
            .checked_add(accounting.network_fee)
            .ok_or(FeeError::Overflow)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_storage_is_stamped_with_current_version() {
        let mut storage = Storage::new();
        assert_eq!(storage.schema_version(), None);
        migrate(&mut storage).expect("fresh store migrates");
        assert_eq!(storage.schema_version(), Some(SCHEMA_VERSION));
    }

    #[test]
    fn migration_is_idempotent_at_current_version() {
        let mut storage = Storage::new();
        storage.set_schema_version(SCHEMA_VERSION);
        migrate(&mut storage).expect("current version is a no-op");
        assert_eq!(storage.schema_version(), Some(SCHEMA_VERSION));
    }

    #[test]
    fn newer_schema_is_rejected() {
        let mut storage = Storage::new();
        storage.set_schema_version(SCHEMA_VERSION + 1);
        assert_eq!(
            migrate(&mut storage),
            Err(MigrationError::UnsupportedVersion {
                found: SCHEMA_VERSION + 1,
                supported: SCHEMA_VERSION,
            })
        );
    }

    #[test]
    fn upgrade_from_populated_prior_schema_preserves_data() {
        // Simulate a store populated under a prior (unversioned) schema.
        let mut storage = Storage::new();
        let account = [7u8; 32];
        storage.set(StorageKey::Balance(account), 1_000);
        storage.set(StorageKey::ProtocolFees, 25);
        storage.set(StorageKey::NetworkFees, 10);
        assert_eq!(storage.schema_version(), None);

        // Upgrade: the marker is stamped and existing entries are preserved.
        migrate(&mut storage).expect("prior schema upgrades");
        assert_eq!(storage.schema_version(), Some(SCHEMA_VERSION));
        assert_eq!(storage.get(&StorageKey::Balance(account)), Some(1_000));
        assert_eq!(storage.get(&StorageKey::ProtocolFees), Some(25));
        assert_eq!(storage.get(&StorageKey::NetworkFees), Some(10));
    }

    #[test]
    fn storage_keys_carry_schema_version() {
        assert_eq!(StorageKey::SchemaVersion.version(), SCHEMA_VERSION);
        assert_eq!(StorageKey::Balance([0u8; 32]).version(), SCHEMA_VERSION);
        assert_eq!(StorageKey::ProtocolFees.version(), SCHEMA_VERSION);
        assert_eq!(StorageKey::NetworkFees.version(), SCHEMA_VERSION);
    }
}
