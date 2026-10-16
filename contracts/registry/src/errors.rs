use soroban_sdk::contracterror;

/// Error codes returned by the registry contract.
///
/// Externally visible behavior:
/// - `TagNotFound` (code 3) is returned by read/query methods when a tag has
///   never been registered. Read methods never create storage entries, so a
///   missing tag stays missing until an explicit write registers it.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistryError {
    /// Caller is not authorized to perform the requested write.
    Unauthorized = 1,
    /// The provided tag is invalid (e.g. empty or malformed).
    InvalidTag = 2,
    /// The requested tag has no registered entry.
    ///
    /// This is a stable, typed not-found result: querying a missing tag
    /// returns `Err(RegistryError::TagNotFound)` and performs no storage
    /// writes, so repeated reads cannot grow storage.
    TagNotFound = 3,
    /// The tag is already registered and cannot be registered again.
    TagAlreadyExists = 4,
    /// A numeric field overflowed its supported range.
    Overflow = 5,
}
