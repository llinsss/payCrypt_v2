use soroban_sdk::contracterror;

/// Typed contract errors for the escrow contract.
///
/// Error codes are part of the on-chain ABI: existing discriminants MUST NOT be
/// renumbered or reused so that already-deployed clients keep decoding failures
/// correctly across upgrades. New variants are appended at the end.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    /// Caller is not authorized to perform this action.
    Unauthorized = 1,
    /// The escrow was not found in storage.
    NotFound = 2,
    /// The requested state transition is not allowed from the current state.
    InvalidTransition = 3,
    /// The operation was already applied (replay / double-spend attempt).
    Replay = 4,
    /// An amount or balance is out of the allowed range.
    InvalidAmount = 5,
    /// The escrow has already been funded.
    AlreadyFunded = 6,
    /// The escrow has not been funded yet.
    NotFunded = 7,
    /// The escrow is not in a disputed state.
    NotDisputed = 8,
    /// A dispute is already open for this escrow.
    DisputeAlreadyOpen = 9,
    /// The dispute has already been resolved.
    DisputeAlreadyResolved = 10,
    /// The caller is not the designated arbiter for this dispute.
    NotArbiter = 11,
    /// The dispute resolution outcome is invalid.
    InvalidResolution = 12,
    /// The dispute window / deadline has elapsed.
    DisputeExpired = 13,
}
