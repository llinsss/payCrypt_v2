//! Stable, documented error codes for the Rust contract SDK.
//!
//! Every failure surfaced by the SDK is represented by a [`ContractError`]
//! variant with a stable [`ContractError::code`] string and an explicit
//! [`ContractError::retryable`] flag. SDK consumers should branch on the code
//! (or the variant) rather than parsing human-readable messages.

use std::fmt;

/// Public error categories returned by the contract SDK.
///
/// The numeric value of each variant is part of the public API and must not
/// change once released; SDKs rely on it for programmatic handling.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[repr(u16)]
pub enum ErrorCategory {
    /// Input failed validation before reaching the contract.
    Validation = 1000,
    /// The caller is not authorized for the requested operation.
    Authorization = 1001,
    /// The requested resource or account was not found.
    NotFound = 1002,
    /// The operation conflicts with current on-chain state.
    Conflict = 1003,
    /// A transient failure; the caller may retry.
    Transient = 1004,
    /// An unexpected internal failure.
    Internal = 1005,
}

impl ErrorCategory {
    /// Stable string code for this category, safe to persist and compare.
    pub const fn code(self) -> &'static str {
        match self {
            ErrorCategory::Validation => "VALIDATION",
            ErrorCategory::Authorization => "AUTHORIZATION",
            ErrorCategory::NotFound => "NOT_FOUND",
            ErrorCategory::Conflict => "CONFLICT",
            ErrorCategory::Transient => "TRANSIENT",
            ErrorCategory::Internal => "INTERNAL",
        }
    }

    /// Whether an error in this category is safe to retry.
    pub const fn retryable(self) -> bool {
        matches!(self, ErrorCategory::Transient)
    }
}

/// Documented error variants returned by the Rust contract SDK.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContractError {
    /// A required field was missing or malformed.
    InvalidInput { field: String },
    /// The caller lacks permission for the operation.
    Unauthorized { account: String },
    /// The referenced account or resource does not exist.
    NotFound { resource: String },
    /// The operation conflicts with current state (e.g. nonce reuse).
    Conflict { reason: String },
    /// A transient failure occurred; retrying may succeed.
    Transient { reason: String },
    /// An unexpected internal failure occurred.
    Internal { reason: String },
}

impl ContractError {
    /// The public category this error belongs to.
    pub const fn category(&self) -> ErrorCategory {
        match self {
            ContractError::InvalidInput { .. } => ErrorCategory::Validation,
            ContractError::Unauthorized { .. } => ErrorCategory::Authorization,
            ContractError::NotFound { .. } => ErrorCategory::NotFound,
            ContractError::Conflict { .. } => ErrorCategory::Conflict,
            ContractError::Transient { .. } => ErrorCategory::Transient,
            ContractError::Internal { .. } => ErrorCategory::Internal,
        }
    }

    /// Stable, machine-readable error code (e.g. `"VALIDATION"`).
    pub const fn code(&self) -> &'static str {
        self.category().code()
    }

    /// Whether the caller may safely retry the failed operation.
    pub const fn retryable(&self) -> bool {
        self.category().retryable()
    }

    /// User-facing message suitable for display in the Rust SDK.
    pub fn user_message(&self) -> String {
        match self {
            ContractError::InvalidInput { field } => {
                format!("Invalid input: the field `{field}` is missing or malformed.")
            }
            ContractError::Unauthorized { account } => {
                format!("Not authorized: account `{account}` cannot perform this operation.")
            }
            ContractError::NotFound { resource } => {
                format!("Not found: `{resource}` does not exist.")
            }
            ContractError::Conflict { reason } => {
                format!("Conflict: {reason}. Refresh state and try again.")
            }
            ContractError::Transient { reason } => {
                format!("Temporary failure: {reason}. Please retry.")
            }
            ContractError::Internal { reason } => {
                format!("Internal error: {reason}. Please contact support.")
            }
        }
    }
}

impl fmt::Display for ContractError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code(), self.user_message())
    }
}

impl std::error::Error for ContractError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_codes_are_stable() {
        assert_eq!(ContractError::InvalidInput { field: "x".into() }.code(), "VALIDATION");
        assert_eq!(ContractError::Unauthorized { account: "a".into() }.code(), "AUTHORIZATION");
        assert_eq!(ContractError::NotFound { resource: "r".into() }.code(), "NOT_FOUND");
        assert_eq!(ContractError::Conflict { reason: "c".into() }.code(), "CONFLICT");
        assert_eq!(ContractError::Transient { reason: "t".into() }.code(), "TRANSIENT");
        assert_eq!(ContractError::Internal { reason: "i".into() }.code(), "INTERNAL");
    }

    #[test]
    fn category_numeric_values_are_stable() {
        assert_eq!(ErrorCategory::Validation as u16, 1000);
        assert_eq!(ErrorCategory::Authorization as u16, 1001);
        assert_eq!(ErrorCategory::NotFound as u16, 1002);
        assert_eq!(ErrorCategory::Conflict as u16, 1003);
        assert_eq!(ErrorCategory::Transient as u16, 1004);
        assert_eq!(ErrorCategory::Internal as u16, 1005);
    }

    #[test]
    fn retryability_is_documented() {
        assert!(ContractError::Transient { reason: "t".into() }.retryable());
        assert!(!ContractError::InvalidInput { field: "x".into() }.retryable());
        assert!(!ContractError::Unauthorized { account: "a".into() }.retryable());
        assert!(!ContractError::NotFound { resource: "r".into() }.retryable());
        assert!(!ContractError::Conflict { reason: "c".into() }.retryable());
        assert!(!ContractError::Internal { reason: "i".into() }.retryable());
    }

    #[test]
    fn user_messages_are_non_empty() {
        let errors = [
            ContractError::InvalidInput { field: "x".into() },
            ContractError::Unauthorized { account: "a".into() },
            ContractError::NotFound { resource: "r".into() },
            ContractError::Conflict { reason: "c".into() },
            ContractError::Transient { reason: "t".into() },
            ContractError::Internal { reason: "i".into() },
        ];
        for err in errors {
            assert!(!err.user_message().is_empty());
            assert!(err.to_string().contains(err.code()));
        }
    }
}
