use soroban_sdk::contracterror;

/// Error codes returned by the wallet contract.
///
/// Externally visible behavior: every failing invocation returns one of these
/// numeric codes. Codes are stable and must not be renumbered.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum WalletError {
    /// Caller is not authorized to perform this operation.
    Unauthorized = 1,
    /// The wallet is paused; asset-moving methods are blocked.
    /// Recovery and governance operations remain available while paused.
    Paused = 2,
    /// The wallet is not paused; unpause was requested unnecessarily.
    NotPaused = 3,
    /// A supplied amount or argument is invalid.
    InvalidAmount = 4,
    /// The requested asset or balance was not found.
    NotFound = 5,
    /// The operation would exceed a configured limit.
    LimitExceeded = 6,
}
