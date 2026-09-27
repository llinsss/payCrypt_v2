//! Rust SDK for interacting with the wallet contract.
//!
//! This crate exposes stable, documented error categories so that SDK
//! consumers can handle contract failures programmatically instead of
//! parsing opaque error strings.

use std::fmt;

/// Stable error categories returned by the wallet contract.
///
/// Each variant maps to a fixed numeric code (see [`ContractError::code`])
/// so that SDKs can branch on the category without string parsing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[non_exhaustive]
pub enum ContractError {
    /// The caller is not authorized to perform the requested action.
    Unauthorized,
    /// The requested resource or account was not found.
    NotFound,
    /// The request was malformed or failed validation.
    InvalidInput,
    /// The operation conflicts with the current contract state.
    Conflict,
    /// The contract is temporarily unavailable; the call may be retried.
    Unavailable,
    /// An unexpected internal contract failure occurred.
    Internal,
}

impl ContractError {
    /// Returns the stable numeric error code for this category.
    ///
    /// These codes are part of the public API and must not change.
    pub const fn code(self) -> u32 {
        match self {
            ContractError::Unauthorized => 1001,
            ContractError::NotFound => 1002,
            ContractError::InvalidInput => 1003,
            ContractError::Conflict => 1004,
            ContractError::Unavailable => 1005,
            ContractError::Internal => 1006,
        }
    }

    /// Returns the stable machine-readable identifier for this category.
    pub const fn as_str(self) -> &'static str {
        match self {
            ContractError::Unauthorized => "unauthorized",
            ContractError::NotFound => "not_found",
            ContractError::InvalidInput => "invalid_input",
            ContractError::Conflict => "conflict",
            ContractError::Unavailable => "unavailable",
            ContractError::Internal => "internal",
        }
    }

    /// Returns whether a call that failed with this category may be retried.
    pub const fn is_retryable(self) -> bool {
        matches!(self, ContractError::Unavailable)
    }

    /// Returns a user-facing message suitable for display in the SDK.
    pub const fn message(self) -> &'static str {
        match self {
            ContractError::Unauthorized => "You are not authorized to perform this action.",
            ContractError::NotFound => "The requested resource could not be found.",
            ContractError::InvalidInput => "The request was invalid. Please check your input.",
            ContractError::Conflict => "The request conflicts with the current state.",
            ContractError::Unavailable => {
                "The service is temporarily unavailable. Please try again."
            }
            ContractError::Internal => "An unexpected error occurred. Please try again later.",
        }
    }

    /// Resolves a stable numeric error code back to its category.
    pub const fn from_code(code: u32) -> Option<ContractError> {
        match code {
            1001 => Some(ContractError::Unauthorized),
            1002 => Some(ContractError::NotFound),
            1003 => Some(ContractError::InvalidInput),
            1004 => Some(ContractError::Conflict),
            1005 => Some(ContractError::Unavailable),
            1006 => Some(ContractError::Internal),
            _ => None,
        }
    }
}

impl fmt::Display for ContractError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.message())
    }
}

impl std::error::Error for ContractError {}

#[cfg(test)]
mod tests {
    use super::ContractError;

    const ALL: [ContractError; 6] = [
        ContractError::Unauthorized,
        ContractError::NotFound,
        ContractError::InvalidInput,
        ContractError::Conflict,
        ContractError::Unavailable,
        ContractError::Internal,
    ];

    #[test]
    fn error_codes_are_stable() {
        assert_eq!(ContractError::Unauthorized.code(), 1001);
        assert_eq!(ContractError::NotFound.code(), 1002);
        assert_eq!(ContractError::InvalidInput.code(), 1003);
        assert_eq!(ContractError::Conflict.code(), 1004);
        assert_eq!(ContractError::Unavailable.code(), 1005);
        assert_eq!(ContractError::Internal.code(), 1006);
    }

    #[test]
    fn codes_round_trip() {
        for err in ALL {
            assert_eq!(ContractError::from_code(err.code()), Some(err));
        }
        assert_eq!(ContractError::from_code(0), None);
    }

    #[test]
    fn identifiers_are_stable() {
        assert_eq!(ContractError::Unauthorized.as_str(), "unauthorized");
        assert_eq!(ContractError::NotFound.as_str(), "not_found");
        assert_eq!(ContractError::InvalidInput.as_str(), "invalid_input");
        assert_eq!(ContractError::Conflict.as_str(), "conflict");
        assert_eq!(ContractError::Unavailable.as_str(), "unavailable");
        assert_eq!(ContractError::Internal.as_str(), "internal");
    }

    #[test]
    fn retryability_is_documented() {
        assert!(ContractError::Unavailable.is_retryable());
        for err in ALL {
            if err != ContractError::Unavailable {
                assert!(!err.is_retryable(), "{err:?} should not be retryable");
            }
        }
    }

    #[test]
    fn messages_are_user_facing() {
        for err in ALL {
            assert!(!err.message().is_empty());
            assert_eq!(err.to_string(), err.message());
        }
    }
}
