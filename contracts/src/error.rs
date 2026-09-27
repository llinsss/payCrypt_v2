//! Stable, documented error codes for the Rust contracts.
//!
//! SDKs should match on [`ContractError`] variants (or their [`ContractError::code`])
//! instead of parsing human-readable strings. Codes are part of the public API and
//! must remain stable across releases.

use std::fmt;

/// Public error categories exposed by the contracts.
///
/// Each category carries a stable numeric [`ErrorCode`] and a documented
/// [`Retryability`] so SDKs can decide how to react without string parsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ContractError {
    /// Input failed validation (bad arguments, malformed payload).
    InvalidInput,
    /// Caller is not authorized to perform the operation.
    Unauthorized,
    /// The requested resource or account was not found.
    NotFound,
    /// The operation conflicts with the current state (e.g. duplicate entry).
    Conflict,
    /// A precondition required by the operation was not met.
    PreconditionFailed,
    /// The contract is temporarily unavailable; safe to retry later.
    Unavailable,
    /// An unexpected internal failure occurred.
    Internal,
}

/// Stable numeric error codes. These values are part of the public API and
/// MUST NOT change once released.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u32)]
pub enum ErrorCode {
    InvalidInput = 1000,
    Unauthorized = 1001,
    NotFound = 1002,
    Conflict = 1003,
    PreconditionFailed = 1004,
    Unavailable = 1005,
    Internal = 1006,
}

/// Whether an error is safe to retry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Retryability {
    /// Retrying the same request may succeed without changes.
    Retryable,
    /// Retrying will not help until the caller changes the request or state.
    NonRetryable,
}

impl ContractError {
    /// The stable numeric code for this error category.
    pub const fn code(self) -> ErrorCode {
        match self {
            ContractError::InvalidInput => ErrorCode::InvalidInput,
            ContractError::Unauthorized => ErrorCode::Unauthorized,
            ContractError::NotFound => ErrorCode::NotFound,
            ContractError::Conflict => ErrorCode::Conflict,
            ContractError::PreconditionFailed => ErrorCode::PreconditionFailed,
            ContractError::Unavailable => ErrorCode::Unavailable,
            ContractError::Internal => ErrorCode::Internal,
        }
    }

    /// The numeric value of the stable code, suitable for wire formats.
    pub const fn code_value(self) -> u32 {
        self.code() as u32
    }

    /// Whether the caller may safely retry the operation.
    pub const fn retryability(self) -> Retryability {
        match self {
            ContractError::Unavailable | ContractError::Internal => Retryability::Retryable,
            ContractError::InvalidInput
            | ContractError::Unauthorized
            | ContractError::NotFound
            | ContractError::Conflict
            | ContractError::PreconditionFailed => Retryability::NonRetryable,
        }
    }

    /// Whether the caller may safely retry the operation.
    pub const fn is_retryable(self) -> bool {
        matches!(self.retryability(), Retryability::Retryable)
    }

    /// A stable, user-facing message for this error category.
    ///
    /// SDKs may surface this directly to end users; it is intentionally
    /// independent of any internal detail.
    pub const fn message(self) -> &'static str {
        match self {
            ContractError::InvalidInput => "The request was invalid. Please check your input and try again.",
            ContractError::Unauthorized => "You are not authorized to perform this action.",
            ContractError::NotFound => "The requested resource could not be found.",
            ContractError::Conflict => "The request conflicts with the current state.",
            ContractError::PreconditionFailed => "A required condition was not met.",
            ContractError::Unavailable => "The service is temporarily unavailable. Please try again later.",
            ContractError::Internal => "An unexpected error occurred. Please try again later.",
        }
    }
}

impl fmt::Display for ContractError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code_value(), self.message())
    }
}

impl std::error::Error for ContractError {}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL: [ContractError; 7] = [
        ContractError::InvalidInput,
        ContractError::Unauthorized,
        ContractError::NotFound,
        ContractError::Conflict,
        ContractError::PreconditionFailed,
        ContractError::Unavailable,
        ContractError::Internal,
    ];

    #[test]
    fn error_codes_are_stable() {
        assert_eq!(ContractError::InvalidInput.code_value(), 1000);
        assert_eq!(ContractError::Unauthorized.code_value(), 1001);
        assert_eq!(ContractError::NotFound.code_value(), 1002);
        assert_eq!(ContractError::Conflict.code_value(), 1003);
        assert_eq!(ContractError::PreconditionFailed.code_value(), 1004);
        assert_eq!(ContractError::Unavailable.code_value(), 1005);
        assert_eq!(ContractError::Internal.code_value(), 1006);
    }

    #[test]
    fn codes_are_unique() {
        let mut codes: Vec<u32> = ALL.iter().map(|e| e.code_value()).collect();
        codes.sort_unstable();
        codes.dedup();
        assert_eq!(codes.len(), ALL.len());
    }

    #[test]
    fn retryability_is_documented() {
        assert!(ContractError::Unavailable.is_retryable());
        assert!(ContractError::Internal.is_retryable());
        assert!(!ContractError::InvalidInput.is_retryable());
        assert!(!ContractError::Unauthorized.is_retryable());
        assert!(!ContractError::NotFound.is_retryable());
        assert!(!ContractError::Conflict.is_retryable());
        assert!(!ContractError::PreconditionFailed.is_retryable());
    }

    #[test]
    fn messages_are_non_empty_and_stable() {
        for err in ALL {
            assert!(!err.message().is_empty());
            assert!(err.to_string().contains(err.message()));
        }
    }
}
