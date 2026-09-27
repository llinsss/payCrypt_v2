//! Fee and sponsorship accounting for relayed / sponsored transactions.
//!
//! This module keeps the three monetary components of a settlement strictly
//! separate:
//!
//! * `principal`    - the amount that belongs to the recipient,
//! * `protocol_fee` - the fee retained by the protocol,
//! * `network_fee`  - the fee forwarded to the network / relayer.
//!
//! The recipient is always credited the full `principal`. Fees are charged on
//! top of the principal and are paid by the configured payer (the sponsor for
//! sponsored transactions, otherwise the sender). This guarantees that fee
//! deductions can never silently reduce the amount a recipient receives.

use core::fmt;

/// Maximum protocol fee, expressed in basis points (1 bp = 0.01%).
/// 1_000 bps == 10%.
pub const MAX_PROTOCOL_FEE_BPS: u16 = 1_000;

/// Maximum network fee, expressed in basis points (1 bp = 0.01%).
/// 500 bps == 5%.
pub const MAX_NETWORK_FEE_BPS: u16 = 500;

/// Basis-point denominator used for all fee math.
pub const BPS_DENOMINATOR: u64 = 10_000;

/// Who is responsible for paying the fees attached to a settlement.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FeePayer {
    /// The original sender pays the fees on top of the principal.
    Sender,
    /// A sponsor pays the fees on behalf of the sender (sponsored tx).
    Sponsor,
    /// A relayer pays the fees and is reimbursed from the fee pool.
    Relayer,
}

/// Fee configuration, bounded so that misconfiguration cannot drain funds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FeeConfig {
    /// Protocol fee in basis points, bounded by [`MAX_PROTOCOL_FEE_BPS`].
    pub protocol_fee_bps: u16,
    /// Network fee in basis points, bounded by [`MAX_NETWORK_FEE_BPS`].
    pub network_fee_bps: u16,
    /// Default payer for fees when no sponsorship is present.
    pub default_payer: FeePayer,
}

impl Default for FeeConfig {
    fn default() -> Self {
        Self {
            protocol_fee_bps: 0,
            network_fee_bps: 0,
            default_payer: FeePayer::Sender,
        }
    }
}

/// Errors returned while validating fee configuration or computing fees.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FeeError {
    /// Protocol fee exceeds [`MAX_PROTOCOL_FEE_BPS`].
    ProtocolFeeOutOfBounds,
    /// Network fee exceeds [`MAX_NETWORK_FEE_BPS`].
    NetworkFeeOutOfBounds,
    /// A fee computation overflowed `u64`.
    Overflow,
}

impl fmt::Display for FeeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            FeeError::ProtocolFeeOutOfBounds => {
                write!(f, "protocol fee exceeds maximum of {MAX_PROTOCOL_FEE_BPS} bps")
            }
            FeeError::NetworkFeeOutOfBounds => {
                write!(f, "network fee exceeds maximum of {MAX_NETWORK_FEE_BPS} bps")
            }
            FeeError::Overflow => write!(f, "fee computation overflowed"),
        }
    }
}

impl FeeConfig {
    /// Builds a validated configuration, rejecting out-of-bounds fees.
    pub fn new(
        protocol_fee_bps: u16,
        network_fee_bps: u16,
        default_payer: FeePayer,
    ) -> Result<Self, FeeError> {
        let config = Self {
            protocol_fee_bps,
            network_fee_bps,
            default_payer,
        };
        config.validate()?;
        Ok(config)
    }

    /// Enforces the configured fee bounds.
    pub fn validate(&self) -> Result<(), FeeError> {
        if self.protocol_fee_bps > MAX_PROTOCOL_FEE_BPS {
            return Err(FeeError::ProtocolFeeOutOfBounds);
        }
        if self.network_fee_bps > MAX_NETWORK_FEE_BPS {
            return Err(FeeError::NetworkFeeOutOfBounds);
        }
        Ok(())
    }

    /// Updates the protocol fee, enforcing bounds on the new value.
    pub fn set_protocol_fee_bps(&mut self, bps: u16) -> Result<(), FeeError> {
        if bps > MAX_PROTOCOL_FEE_BPS {
            return Err(FeeError::ProtocolFeeOutOfBounds);
        }
        self.protocol_fee_bps = bps;
        Ok(())
    }

    /// Updates the network fee, enforcing bounds on the new value.
    pub fn set_network_fee_bps(&mut self, bps: u16) -> Result<(), FeeError> {
        if bps > MAX_NETWORK_FEE_BPS {
            return Err(FeeError::NetworkFeeOutOfBounds);
        }
        self.network_fee_bps = bps;
        Ok(())
    }
}

/// The three separated monetary components of a settlement.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FeeBreakdown {
    /// Amount credited to the recipient. Never reduced by fees.
    pub principal: u64,
    /// Protocol fee, charged on top of the principal.
    pub protocol_fee: u64,
    /// Network / relayer fee, charged on top of the principal.
    pub network_fee: u64,
    /// Who pays `protocol_fee + network_fee`.
    pub payer: FeePayer,
}

impl FeeBreakdown {
    /// Total amount the payer must supply: principal plus both fees.
    pub fn total_debit(&self) -> Result<u64, FeeError> {
        self.principal
            .checked_add(self.protocol_fee)
            .and_then(|v| v.checked_add(self.network_fee))
            .ok_or(FeeError::Overflow)
    }

    /// Total fees charged on top of the principal.
    pub fn total_fees(&self) -> Result<u64, FeeError> {
        self.protocol_fee
            .checked_add(self.network_fee)
            .ok_or(FeeError::Overflow)
    }
}

/// Computes a fee for `amount` at `bps`, rounding **down** (floor).
///
/// Floor rounding is deterministic and never charges more than the configured
/// rate, so the payer is never over-charged by a rounding step.
fn fee_floor(amount: u64, bps: u16) -> Result<u64, FeeError> {
    let numerator = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(FeeError::Overflow)?;
    let fee = numerator / (BPS_DENOMINATOR as u128);
    u64::try_from(fee).map_err(|_| FeeError::Overflow)
}

/// Computes the full fee breakdown for a settlement.
///
/// `principal` is the amount the recipient receives and is returned unchanged.
/// Fees are computed on top of the principal and attributed to `payer`.
/// When `sponsor` is `Some`, the sponsor pays the fees regardless of the
/// configured default payer, which is how sponsored / relayed transactions are
/// accounted for.
pub fn compute_fees(
    principal: u64,
    config: &FeeConfig,
    sponsor: Option<FeePayer>,
) -> Result<FeeBreakdown, FeeError> {
    config.validate()?;

    let protocol_fee = fee_floor(principal, config.protocol_fee_bps)?;
    let network_fee = fee_floor(principal, config.network_fee_bps)?;

    let payer = sponsor.unwrap_or(config.default_payer);

    Ok(FeeBreakdown {
        principal,
        protocol_fee,
        network_fee,
        payer,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_fees_leave_principal_untouched() {
        let config = FeeConfig::default();
        let breakdown = compute_fees(1_000, &config, None).unwrap();

        assert_eq!(breakdown.principal, 1_000);
        assert_eq!(breakdown.protocol_fee, 0);
        assert_eq!(breakdown.network_fee, 0);
        assert_eq!(breakdown.total_debit().unwrap(), 1_000);
        assert_eq!(breakdown.payer, FeePayer::Sender);
    }

    #[test]
    fn maximum_fees_are_bounded_and_recipient_keeps_principal() {
        let config = FeeConfig::new(
            MAX_PROTOCOL_FEE_BPS,
            MAX_NETWORK_FEE_BPS,
            FeePayer::Sender,
        )
        .unwrap();

        let principal = 1_000_000u64;
        let breakdown = compute_fees(principal, &config, None).unwrap();

        // 10% protocol + 5% network, charged on top of the principal.
        assert_eq!(breakdown.principal, principal);
        assert_eq!(breakdown.protocol_fee, 100_000);
        assert_eq!(breakdown.network_fee, 50_000);
        assert_eq!(breakdown.total_debit().unwrap(), 1_150_000);
    }

    #[test]
    fn changed_fee_values_are_applied_and_recipient_is_unaffected() {
        let mut config = FeeConfig::default();
        config.set_protocol_fee_bps(250).unwrap();
        config.set_network_fee_bps(100).unwrap();

        let principal = 10_000u64;
        let breakdown = compute_fees(principal, &config, None).unwrap();

        assert_eq!(breakdown.principal, principal);
        assert_eq!(breakdown.protocol_fee, 250);
        assert_eq!(breakdown.network_fee, 100);
        assert_eq!(breakdown.total_fees().unwrap(), 350);
    }

    #[test]
    fn out_of_bounds_fee_updates_are_rejected() {
        let mut config = FeeConfig::default();

        assert_eq!(
            config.set_protocol_fee_bps(MAX_PROTOCOL_FEE_BPS + 1),
            Err(FeeError::ProtocolFeeOutOfBounds)
        );
        assert_eq!(
            config.set_network_fee_bps(MAX_NETWORK_FEE_BPS + 1),
            Err(FeeError::NetworkFeeOutOfBounds)
        );
        assert_eq!(
            FeeConfig::new(MAX_PROTOCOL_FEE_BPS + 1, 0, FeePayer::Sender),
            Err(FeeError::ProtocolFeeOutOfBounds)
        );
    }

    #[test]
    fn rounding_is_deterministic_and_floors() {
        let config = FeeConfig::new(1, 1, FeePayer::Sender).unwrap();

        // 1 bp of 9_999 == 0.9999 -> floors to 0.
        let breakdown = compute_fees(9_999, &config, None).unwrap();
        assert_eq!(breakdown.protocol_fee, 0);
        assert_eq!(breakdown.network_fee, 0);

        // 1 bp of 10_000 == 1 exactly.
        let breakdown = compute_fees(10_000, &config, None).unwrap();
        assert_eq!(breakdown.protocol_fee, 1);
        assert_eq!(breakdown.network_fee, 1);
    }

    #[test]
    fn sponsor_pays_fees_without_reducing_recipient_amount() {
        let config = FeeConfig::new(500, 100, FeePayer::Sender).unwrap();
        let principal = 1_000u64;

        let breakdown = compute_fees(principal, &config, Some(FeePayer::Sponsor)).unwrap();

        assert_eq!(breakdown.payer, FeePayer::Sponsor);
        assert_eq!(breakdown.principal, principal);
        assert_eq!(breakdown.protocol_fee, 50);
        assert_eq!(breakdown.network_fee, 10);
        assert_eq!(breakdown.total_debit().unwrap(), 1_060);
    }
}
