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

use std::collections::BTreeMap;

/// Basis-point denominator (100% == 10_000 bps).
const BPS_DENOMINATOR: u64 = 10_000;

/// Hard upper bound for any single fee, expressed in basis points.
/// 1_000 bps == 10%.
pub const MAX_FEE_BPS: u64 = 1_000;

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

    const SPONSOR: [u8; 32] = [1u8; 32];
    const RECIPIENT: [u8; 32] = [2u8; 32];

    #[test]
    fn zero_fees_leave_principal_untouched() {
        let config = FeeConfig::zero();
        let accounting = FeeAccounting::compute(1_000, &config, FeePayer::Sponsor).unwrap();
        assert_eq!(accounting.protocol_fee, 0);
        assert_eq!(accounting.network_fee, 0);
        assert_eq!(accounting.total_charged, 1_000);
        assert_eq!(accounting.recipient_amount().unwrap(), 1_000);
    }

    #[test]
    fn maximum_fees_are_bounded() {
        let config = FeeConfig::new(MAX_FEE_BPS, MAX_FEE_BPS).unwrap();
        let accounting = FeeAccounting::compute(10_000, &config, FeePayer::Relayer).unwrap();
        assert_eq!(accounting.protocol_fee, 1_000);
        assert_eq!(accounting.network_fee, 1_000);
        assert_eq!(accounting.total_charged, 12_000);
        // Sponsored: recipient still receives the full principal.
        assert_eq!(accounting.recipient_amount().unwrap(), 10_000);
    }

    #[test]
    fn out_of_bounds_fees_are_rejected() {
        assert_eq!(
            FeeConfig::new(MAX_FEE_BPS + 1, 0),
            Err(FeeError::FeeOutOfBounds {
                requested_bps: MAX_FEE_BPS + 1,
                max_bps: MAX_FEE_BPS,
            })
        );
        assert_eq!(
            FeeConfig::new(0, MAX_FEE_BPS + 1),
            Err(FeeError::FeeOutOfBounds {
                requested_bps: MAX_FEE_BPS + 1,
                max_bps: MAX_FEE_BPS,
            })
        );
    }

    #[test]
    fn changed_fee_values_are_enforced_and_rollback_on_error() {
        let mut config = FeeConfig::new(100, 100).unwrap();
        config.set_protocol_fee_bps(500).unwrap();
        assert_eq!(config.protocol_fee_bps(), 500);

        // Rejected update must not mutate the stored configuration.
        assert!(config.set_network_fee_bps(MAX_FEE_BPS + 1).is_err());
        assert_eq!(config.network_fee_bps(), 100);
    }

    #[test]
    fn rounding_is_deterministic_and_floors() {
        // 1 bps of 9_999 == 0.9999 -> floors to 0.
        let config = FeeConfig::new(1, 0).unwrap();
        let accounting = FeeAccounting::compute(9_999, &config, FeePayer::Sponsor).unwrap();
        assert_eq!(accounting.protocol_fee, 0);
        assert_eq!(accounting.recipient_amount().unwrap(), 9_999);
    }

    #[test]
    fn recipient_paid_fees_reduce_recipient_amount() {
        let config = FeeConfig::new(100, 100).unwrap();
        let accounting = FeeAccounting::compute(10_000, &config, FeePayer::Recipient).unwrap();
        assert_eq!(accounting.total_charged, 10_000);
        assert_eq!(accounting.recipient_amount().unwrap(), 9_800);
    }

    #[test]
    fn settlement_keeps_fees_separate_from_principal() {
        let config = FeeConfig::new(100, 100).unwrap();
        let accounting = FeeAccounting::compute(10_000, &config, FeePayer::Sponsor).unwrap();

        let mut ledger = Ledger::new();
        ledger.credit(&SPONSOR, 20_000).unwrap();
        ledger.settle(&SPONSOR, &RECIPIENT, &accounting).unwrap();

        assert_eq!(ledger.balance_of(&RECIPIENT), 10_000);
        assert_eq!(ledger.balance_of(&SPONSOR), 8_000);
        assert_eq!(ledger.protocol_fees(), 100);
        assert_eq!(ledger.network_fees(), 100);
    }
}
