//! Shared test-support utilities for Soroban contracts.
//!
//! This crate provides reusable test doubles and helpers that can be
//! consumed by any contract crate's test suite. Keeping the fixtures here
//! (rather than duplicating them per-crate) lets every value-moving contract
//! exercise the same malicious-token behaviors.
//!
//! # Malicious token doubles
//!
//! The [`malicious`] module exposes a family of token doubles that model the
//! hostile behaviors a real token may exhibit. Each double documents whether
//! the behavior is *rejected* (safely handled by a well-written contract) or
//! *supported* (allowed to proceed).
//!
//! # Authorization fixtures
//!
//! The [`auth`] module provides helpers for authorized, unauthorized, and
//! delegated invocations. They configure the test host's mocked auth only and
//! leave contract `require_auth` checks unchanged.

#![cfg(any(test, feature = "testutils"))]

pub mod auth;
pub mod malicious;

pub use auth::{authorize_all, authorize_delegated, authorize_invoke, unauthorized};
pub use malicious::{
    EdgeCaseToken, EdgeCaseValue, FeeOnTransferToken, MaliciousToken, PausableToken,
    ReentrantToken, RevocableToken,
};
