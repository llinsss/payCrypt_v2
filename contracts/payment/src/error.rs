use soroban_sdk::contracterror;

/// Error codes returned by the payment contract.
///
/// These are stable, externally visible values: integrators may match on the
/// numeric code, so existing variants must not be renumbered.
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
    /// The referenced payment does not exist.
    PaymentNotFound = 4,
    /// The payment is not in a state that allows this operation.
    InvalidStatus = 5,
    /// The supplied amount is not valid (e.g. zero or negative).
    InvalidAmount = 6,
    /// The payment has expired.
    PaymentExpired = 7,
    /// The payment has already been cancelled.
    AlreadyCancelled = 8,
    /// The payment has already been refunded.
    AlreadyRefunded = 9,
    /// The requested refund exceeds the amount of funds received.
    ///
    /// Returned when the cumulative refunded amount would exceed the
    /// cumulative funded amount for the payment (over-by-one is rejected;
    /// an exact-equal refund is allowed).
    RefundExceedsFunds = 10,
    /// The operation was already performed with the same parameters.
    ///
    /// Used for idempotent operations such as duplicate refund attempts.
    DuplicateOperation = 11,
    /// The supplied expiry is not valid (e.g. not in the future).
    ///
    /// Returned when a payment is created or updated with an expiry that is
    /// not strictly after the current ledger timestamp.
    InvalidExpiry = 12,
    /// The payment has not yet expired.
    ///
    /// Returned when an expiry-gated transition (e.g. expiry cancellation)
    /// is attempted before the stored expiry has been reached.
    PaymentNotExpired = 13,
}
