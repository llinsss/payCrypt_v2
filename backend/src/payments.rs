use std::collections::HashSet;
use std::sync::Mutex;

/// A signed payment intent relayed through the backend.
///
/// The intent is bound to a specific chain/network, contract, payer,
/// recipient, amount, and expiry so that a signature produced for one
/// context cannot be replayed in another.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PaymentIntent {
    /// Unique nonce/domain for this intent. Consumed exactly once.
    pub nonce: String,
    /// Chain/network identifier (e.g. "ethereum-mainnet", "base-sepolia").
    pub chain_id: String,
    /// Address of the payment contract the intent targets.
    pub contract: String,
    /// Address of the payer authorizing the intent.
    pub payer: String,
    /// Address of the recipient receiving the funds.
    pub recipient: String,
    /// Amount in the smallest unit of the chain's native/token denomination.
    pub amount: u128,
    /// Unix timestamp (seconds) after which the intent is no longer valid.
    pub expiry: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum PaymentError {
    /// The intent's expiry has passed.
    Expired,
    /// The nonce has already been consumed (duplicate replay).
    Replay,
    /// The intent does not match the expected chain/network binding.
    WrongNetwork,
}

/// Tracks consumed nonces so an intent can never execute twice.
///
/// Nonces are namespaced by chain/network so that the same nonce value on a
/// different network is treated independently, while a duplicate on the same
/// network is rejected.
pub struct ReplayGuard {
    consumed: Mutex<HashSet<String>>,
}

impl ReplayGuard {
    pub fn new() -> Self {
        Self {
            consumed: Mutex::new(HashSet::new()),
        }
    }

    /// Atomically mark the intent's nonce as consumed.
    ///
    /// Returns `Err(PaymentError::Replay)` if the nonce was already consumed
    /// for this chain/network. The check-and-insert happens under a single
    /// lock so concurrent relays cannot both succeed.
    fn consume(&self, chain_id: &str, nonce: &str) -> Result<(), PaymentError> {
        let key = format!("{}:{}", chain_id, nonce);
        let mut consumed = self.consumed.lock().expect("replay guard poisoned");
        if !consumed.insert(key) {
            return Err(PaymentError::Replay);
        }
        Ok(())
    }
}

impl Default for ReplayGuard {
    fn default() -> Self {
        Self::new()
    }
}

/// Validate and execute a payment intent exactly once.
///
/// The intent is bound to `expected_chain_id`; a mismatch is rejected as a
/// cross-network replay. Expired intents are rejected. On success the nonce
/// is consumed atomically so a duplicate relay of the same intent fails.
pub fn execute_intent(
    guard: &ReplayGuard,
    expected_chain_id: &str,
    intent: &PaymentIntent,
    now: u64,
) -> Result<(), PaymentError> {
    if intent.chain_id != expected_chain_id {
        return Err(PaymentError::WrongNetwork);
    }
    if now > intent.expiry {
        return Err(PaymentError::Expired);
    }
    guard.consume(&intent.chain_id, &intent.nonce)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn intent(nonce: &str, chain_id: &str) -> PaymentIntent {
        PaymentIntent {
            nonce: nonce.to_string(),
            chain_id: chain_id.to_string(),
            contract: "0xcontract".to_string(),
            payer: "0xpayer".to_string(),
            recipient: "0xrecipient".to_string(),
            amount: 1_000,
            expiry: 10_000,
        }
    }

    #[test]
    fn executes_once() {
        let guard = ReplayGuard::new();
        let i = intent("nonce-1", "ethereum-mainnet");
        assert_eq!(execute_intent(&guard, "ethereum-mainnet", &i, 1), Ok(()));
    }

    #[test]
    fn rejects_duplicate_replay() {
        let guard = ReplayGuard::new();
        let i = intent("nonce-1", "ethereum-mainnet");
        assert_eq!(execute_intent(&guard, "ethereum-mainnet", &i, 1), Ok(()));
        assert_eq!(
            execute_intent(&guard, "ethereum-mainnet", &i, 1),
            Err(PaymentError::Replay)
        );
    }

    #[test]
    fn rejects_cross_network_replay() {
        let guard = ReplayGuard::new();
        let i = intent("nonce-1", "ethereum-mainnet");
        // Same intent relayed against a different expected network is rejected.
        assert_eq!(
            execute_intent(&guard, "base-sepolia", &i, 1),
            Err(PaymentError::WrongNetwork)
        );
        // The nonce was not consumed by the rejected attempt.
        assert_eq!(execute_intent(&guard, "ethereum-mainnet", &i, 1), Ok(()));
    }

    #[test]
    fn same_nonce_on_different_networks_is_independent() {
        let guard = ReplayGuard::new();
        let a = intent("nonce-1", "ethereum-mainnet");
        let b = intent("nonce-1", "base-sepolia");
        assert_eq!(execute_intent(&guard, "ethereum-mainnet", &a, 1), Ok(()));
        assert_eq!(execute_intent(&guard, "base-sepolia", &b, 1), Ok(()));
    }

    #[test]
    fn rejects_expired_intent() {
        let guard = ReplayGuard::new();
        let i = intent("nonce-1", "ethereum-mainnet");
        assert_eq!(
            execute_intent(&guard, "ethereum-mainnet", &i, 10_001),
            Err(PaymentError::Expired)
        );
    }
}
