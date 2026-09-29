//! Replay protection for Rust payment intents (issue #734).
//!
//! Payment intents relayed through the backend are signed off-chain and then
//! submitted on-chain. To make an intent impossible to execute twice we bind
//! the signed payload to the full execution context (chain/network, contract,
//! payer, recipient, amount, expiry) plus a unique nonce/domain, and we mark
//! nonces consumed atomically before the intent is allowed to proceed.

use std::collections::HashSet;
use std::sync::Mutex;

/// A signed payment intent relayed through the backend.
///
/// Every field that affects execution is part of the signed payload so that an
/// intent signed for one context cannot be replayed in another.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PaymentIntent {
    /// Chain / network identifier (e.g. "eip155:1", "cosmoshub-4").
    pub chain_id: String,
    /// Address of the payment contract the intent targets.
    pub contract: String,
    /// Address of the payer that signed the intent.
    pub payer: String,
    /// Address of the recipient that receives the funds.
    pub recipient: String,
    /// Amount in the smallest unit of the chain's native token.
    pub amount: u128,
    /// Unix timestamp (seconds) after which the intent is no longer valid.
    pub expiry: u64,
    /// Unique nonce/domain for this intent. Must never be reused.
    pub nonce: String,
}

/// Errors returned when an intent cannot be accepted.
#[derive(Debug, PartialEq, Eq)]
pub enum ReplayError {
    /// The intent's expiry has passed.
    Expired { expiry: u64, now: u64 },
    /// The nonce was already consumed (duplicate replay).
    NonceAlreadyConsumed { nonce: String },
    /// The intent was signed for a different chain/network.
    WrongNetwork { expected: String, got: String },
}

impl std::fmt::Display for ReplayError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ReplayError::Expired { expiry, now } => {
                write!(f, "intent expired at {expiry} (now {now})")
            }
            ReplayError::NonceAlreadyConsumed { nonce } => {
                write!(f, "nonce already consumed: {nonce}")
            }
            ReplayError::WrongNetwork { expected, got } => {
                write!(f, "intent bound to network {got}, expected {expected}")
            }
        }
    }
}

impl std::error::Error for ReplayError {}

/// Canonical message that is signed for an intent.
///
/// Binding every execution-relevant field (chain/network, contract, payer,
/// recipient, amount, expiry) together with the nonce/domain means a signature
/// is only valid for exactly one execution context.
pub fn signing_payload(intent: &PaymentIntent) -> String {
    format!(
        "payment-intent:v1\nchain_id:{}\ncontract:{}\npayer:{}\nrecipient:{}\namount:{}\nexpiry:{}\nnonce:{}",
        intent.chain_id,
        intent.contract,
        intent.payer,
        intent.recipient,
        intent.amount,
        intent.expiry,
        intent.nonce,
    )
}

/// Tracks consumed nonces and enforces replay protection.
///
/// Nonces are marked consumed atomically: the check-and-insert happens while
/// holding the lock, so two concurrent submissions of the same intent cannot
/// both succeed.
pub struct ReplayGuard {
    expected_chain_id: String,
    consumed: Mutex<HashSet<String>>,
}

impl ReplayGuard {
    /// Create a guard bound to the chain/network the backend serves.
    pub fn new(expected_chain_id: impl Into<String>) -> Self {
        Self {
            expected_chain_id: expected_chain_id.into(),
            consumed: Mutex::new(HashSet::new()),
        }
    }

    /// Validate and consume an intent.
    ///
    /// Returns `Ok(())` only if the intent targets the expected network, has
    /// not expired, and its nonce had not been consumed before. On success the
    /// nonce is recorded atomically so the same intent can never execute twice.
    pub fn consume(&self, intent: &PaymentIntent, now: u64) -> Result<(), ReplayError> {
        if intent.chain_id != self.expected_chain_id {
            return Err(ReplayError::WrongNetwork {
                expected: self.expected_chain_id.clone(),
                got: intent.chain_id.clone(),
            });
        }

        if now > intent.expiry {
            return Err(ReplayError::Expired {
                expiry: intent.expiry,
                now,
            });
        }

        // Atomic check-and-insert: the lock is held across both operations so
        // concurrent submissions of the same nonce cannot both pass.
        let mut consumed = self.consumed.lock().expect("replay guard mutex poisoned");
        if !consumed.insert(intent.nonce.clone()) {
            return Err(ReplayError::NonceAlreadyConsumed {
                nonce: intent.nonce.clone(),
            });
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn intent(chain_id: &str, nonce: &str) -> PaymentIntent {
        PaymentIntent {
            chain_id: chain_id.to_string(),
            contract: "0xcontract".to_string(),
            payer: "0xpayer".to_string(),
            recipient: "0xrecipient".to_string(),
            amount: 1_000,
            expiry: 10_000,
            nonce: nonce.to_string(),
        }
    }

    #[test]
    fn accepts_valid_intent() {
        let guard = ReplayGuard::new("eip155:1");
        assert_eq!(guard.consume(&intent("eip155:1", "n1"), 1_000), Ok(()));
    }

    #[test]
    fn rejects_duplicate_replay() {
        let guard = ReplayGuard::new("eip155:1");
        let i = intent("eip155:1", "n1");
        assert_eq!(guard.consume(&i, 1_000), Ok(()));
        assert_eq!(
            guard.consume(&i, 1_000),
            Err(ReplayError::NonceAlreadyConsumed {
                nonce: "n1".to_string()
            })
        );
    }

    #[test]
    fn rejects_cross_network_replay() {
        let guard = ReplayGuard::new("eip155:1");
        let i = intent("cosmoshub-4", "n1");
        assert_eq!(
            guard.consume(&i, 1_000),
            Err(ReplayError::WrongNetwork {
                expected: "eip155:1".to_string(),
                got: "cosmoshub-4".to_string(),
            })
        );
    }

    #[test]
    fn rejects_expired_intent() {
        let guard = ReplayGuard::new("eip155:1");
        let i = intent("eip155:1", "n1");
        assert_eq!(
            guard.consume(&i, 10_001),
            Err(ReplayError::Expired {
                expiry: 10_000,
                now: 10_001,
            })
        );
    }

    #[test]
    fn signing_payload_binds_all_fields() {
        let base = intent("eip155:1", "n1");
        let mut other = base.clone();
        other.amount = 2_000;
        assert_ne!(signing_payload(&base), signing_payload(&other));

        let mut other = base.clone();
        other.recipient = "0xother".to_string();
        assert_ne!(signing_payload(&base), signing_payload(&other));

        let mut other = base.clone();
        other.nonce = "n2".to_string();
        assert_ne!(signing_payload(&base), signing_payload(&other));
    }
}
