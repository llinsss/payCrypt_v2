//! Error codes for the tag owner contract.
//!
//! These codes are part of the externally visible contract surface: they are
//! returned as `Result::Err` values from the contract entry points and are
//! stable across releases so that off-chain tooling can branch on them.

use soroban_sdk::contracterror;

/// Errors returned by the tag owner contract.
///
/// The recovery workflow (issue #953) adds the `Recovery*` variants below.
/// They are appended so that existing numeric codes keep their meaning.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TagOwnerError {
    /// The contract has already been initialized.
    AlreadyInitialized = 1,
    /// The contract has not been initialized yet.
    NotInitialized = 2,
    /// The caller is not authorized to perform this action.
    Unauthorized = 3,
    /// The supplied owner address is not the current owner.
    NotOwner = 4,
    /// The supplied tag id does not exist.
    TagNotFound = 5,
    /// The supplied tag id is already owned by another account.
    TagAlreadyOwned = 6,
    /// A recovery request is already pending for this tag.
    RecoveryAlreadyPending = 7,
    /// No recovery request is pending for this tag.
    RecoveryNotPending = 8,
    /// The recovery delay has not yet elapsed.
    RecoveryDelayNotElapsed = 9,
    /// The recovery delay configured for this tag is invalid.
    InvalidRecoveryDelay = 10,
    /// The recovery request has expired and can no longer be executed.
    RecoveryExpired = 11,
    /// The recovery request was cancelled by the current owner.
    RecoveryCancelled = 12,
}
