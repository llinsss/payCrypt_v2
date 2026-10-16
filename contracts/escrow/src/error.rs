use soroban_sdk::contracterror;

/// Errors returned by the escrow contract.
///
/// Error codes are part of the externally visible contract interface and must
/// remain stable once published.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The contract has already been initialized.
    AlreadyInitialized = 1,
    /// The contract has not been initialized yet.
    NotInitialized = 2,
    /// The caller is not authorized to perform this action.
    Unauthorized = 3,
    /// The escrow with the given id does not exist.
    EscrowNotFound = 4,
    /// The escrow is not in a state that allows the requested operation.
    InvalidState = 5,
    /// The supplied amount is invalid (e.g. zero or negative).
    InvalidAmount = 6,
    /// The supplied asset contract address does not match the asset bound to
    /// the escrow at creation time. No state is mutated when this is returned.
    AssetMismatch = 7,
    /// The supplied metadata exceeds the maximum allowed byte length. No state
    /// is mutated when this is returned.
    MetadataTooLong = 8,
    /// The supplied metadata contains characters outside the supported policy
    /// (printable ASCII only). No state is mutated when this is returned.
    MetadataInvalidChars = 9,
}
