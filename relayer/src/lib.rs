//! Relayer submission library.
//!
//! Provides typed, deterministic rate limiting for relayer submissions.
//!
//! # Trust boundary
//! - Submitters (unprivileged) may only call [`RateLimiter::check_and_record`]
//!   for their own submission key. They cannot configure limits.
//! - Operators/admins (privileged) configure limits via [`RateLimiter::set_limit`]
//!   and reset counters via [`RateLimiter::reset`].
//! - The limiter is the single authority for admission; callers must not
//!   bypass it before forwarding to the Soroban network.
//!
//! # Replay behavior
//! Each submission carries a unique `submission_key`. Replaying the same key
//! is idempotent: the counter is not incremented twice and the original
//! decision is returned.
//!
//! # Failure-safe transitions
//! [`RateLimiter::check_and_record`] validates fully before mutating state, so
//! a rejected or failed submission never partially commits a counter.

use std::collections::HashMap;

/// Configuration for a single rate-limit window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RateLimit {
    /// Maximum number of submissions allowed per window.
    pub max_submissions: u64,
    /// Window length in ledger/seconds units (caller-defined, deterministic).
    pub window: u64,
}

impl RateLimit {
    pub fn new(max_submissions: u64, window: u64) -> Result<Self, RateLimitError> {
        if max_submissions == 0 {
            return Err(RateLimitError::InvalidLimit);
        }
        if window == 0 {
            return Err(RateLimitError::InvalidWindow);
        }
        Ok(Self {
            max_submissions,
            window,
        })
    }
}

/// Errors surfaced by the rate limiter.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RateLimitError {
    /// Limit must be greater than zero.
    InvalidLimit,
    /// Window must be greater than zero.
    InvalidWindow,
    /// Caller is not authorized to perform the privileged action.
    Unauthorized,
    /// The submitter has exhausted its quota for the current window.
    LimitExceeded { submitter: String },
}

/// Privileged role allowed to configure limits and reset counters.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Submitter,
    Operator,
    Admin,
}

impl Role {
    fn can_configure(self) -> bool {
        matches!(self, Role::Operator | Role::Admin)
    }
}

/// Decision returned for a submission attempt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    /// Submission admitted; counter incremented (or replayed).
    Allowed { remaining: u64 },
    /// Submission rejected; no state mutated.
    Rejected(RateLimitError),
}

#[derive(Debug, Clone)]
struct WindowState {
    window_start: u64,
    count: u64,
}

/// Deterministic rate limiter keyed by submitter.
#[derive(Debug, Default)]
pub struct RateLimiter {
    limits: HashMap<String, RateLimit>,
    windows: HashMap<String, WindowState>,
    /// Recorded submission keys for idempotent replay handling.
    seen: HashMap<String, Decision>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self::default()
    }

    /// Privileged: configure the limit for a submitter.
    pub fn set_limit(
        &mut self,
        role: Role,
        submitter: &str,
        limit: RateLimit,
    ) -> Result<(), RateLimitError> {
        if !role.can_configure() {
            return Err(RateLimitError::Unauthorized);
        }
        self.limits.insert(submitter.to_string(), limit);
        Ok(())
    }

    /// Privileged: reset the counter for a submitter.
    pub fn reset(&mut self, role: Role, submitter: &str) -> Result<(), RateLimitError> {
        if !role.can_configure() {
            return Err(RateLimitError::Unauthorized);
        }
        self.windows.remove(submitter);
        Ok(())
    }

    /// Unprivileged: attempt a submission at `now` with a unique `submission_key`.
    ///
    /// Deterministic: given the same inputs and state, the same decision is
    /// produced. Replays of a previously seen key return the original decision
    /// without incrementing counters.
    pub fn check_and_record(
        &mut self,
        submitter: &str,
        submission_key: &str,
        now: u64,
    ) -> Decision {
        if let Some(prev) = self.seen.get(submission_key) {
            return prev.clone();
        }

        let limit = match self.limits.get(submitter) {
            Some(l) => *l,
            None => {
                let decision = Decision::Rejected(RateLimitError::Unauthorized);
                self.seen.insert(submission_key.to_string(), decision.clone());
                return decision;
            }
        };

        // Validate window state without mutating until we know we admit.
        let state = self.windows.get(submitter).cloned();
        let (window_start, count) = match state {
            Some(s) if now < s.window_start + limit.window => (s.window_start, s.count),
            _ => (now, 0),
        };

        if count >= limit.max_submissions {
            let decision = Decision::Rejected(RateLimitError::LimitExceeded {
                submitter: submitter.to_string(),
            });
            self.seen.insert(submission_key.to_string(), decision.clone());
            return decision;
        }

        // Commit atomically after all validation passed.
        let new_count = count + 1;
        self.windows.insert(
            submitter.to_string(),
            WindowState {
                window_start,
                count: new_count,
            },
        );
        let decision = Decision::Allowed {
            remaining: limit.max_submissions - new_count,
        };
        self.seen.insert(submission_key.to_string(), decision.clone());
        decision
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn limiter_with(limit: RateLimit) -> RateLimiter {
        let mut rl = RateLimiter::new();
        rl.set_limit(Role::Admin, "alice", limit).unwrap();
        rl
    }

    #[test]
    fn success_path_admits_and_decrements() {
        let mut rl = limiter_with(RateLimit::new(2, 10).unwrap());
        assert_eq!(
            rl.check_and_record("alice", "k1", 0),
            Decision::Allowed { remaining: 1 }
        );
        assert_eq!(
            rl.check_and_record("alice", "k2", 1),
            Decision::Allowed { remaining: 0 }
        );
    }

    #[test]
    fn boundary_limit_reached_then_exceeded() {
        let mut rl = limiter_with(RateLimit::new(1, 10).unwrap());
        assert_eq!(
            rl.check_and_record("alice", "k1", 0),
            Decision::Allowed { remaining: 0 }
        );
        assert_eq!(
            rl.check_and_record("alice", "k2", 1),
            Decision::Rejected(RateLimitError::LimitExceeded {
                submitter: "alice".into()
            })
        );
    }

    #[test]
    fn window_rollover_resets_counter() {
        let mut rl = limiter_with(RateLimit::new(1, 10).unwrap());
        assert!(matches!(
            rl.check_and_record("alice", "k1", 0),
            Decision::Allowed { .. }
        ));
        assert!(matches!(
            rl.check_and_record("alice", "k2", 10),
            Decision::Allowed { .. }
        ));
    }

    #[test]
    fn unauthorized_submitter_rejected() {
        let mut rl = RateLimiter::new();
        assert_eq!(
            rl.check_and_record("bob", "k1", 0),
            Decision::Rejected(RateLimitError::Unauthorized)
        );
    }

    #[test]
    fn unauthorized_role_cannot_configure() {
        let mut rl = RateLimiter::new();
        let limit = RateLimit::new(1, 10).unwrap();
        assert_eq!(
            rl.set_limit(Role::Submitter, "alice", limit),
            Err(RateLimitError::Unauthorized)
        );
        assert_eq!(
            rl.reset(Role::Submitter, "alice"),
            Err(RateLimitError::Unauthorized)
        );
    }

    #[test]
    fn replay_is_idempotent() {
        let mut rl = limiter_with(RateLimit::new(2, 10).unwrap());
        let first = rl.check_and_record("alice", "k1", 0);
        let replay = rl.check_and_record("alice", "k1", 5);
        assert_eq!(first, replay);
        // Counter only advanced once.
        assert_eq!(
            rl.check_and_record("alice", "k2", 6),
            Decision::Allowed { remaining: 0 }
        );
    }

    #[test]
    fn failure_does_not_partially_commit() {
        let mut rl = limiter_with(RateLimit::new(1, 10).unwrap());
        assert!(matches!(
            rl.check_and_record("alice", "k1", 0),
            Decision::Allowed { .. }
        ));
        // Rejected attempt must not advance the counter further.
        assert!(matches!(
            rl.check_and_record("alice", "k2", 1),
            Decision::Rejected(_)
        ));
        // After reset, a fresh submission is admitted.
        rl.reset(Role::Operator, "alice").unwrap();
        assert!(matches!(
            rl.check_and_record("alice", "k3", 2),
            Decision::Allowed { .. }
        ));
    }

    #[test]
    fn invalid_config_rejected() {
        assert_eq!(RateLimit::new(0, 10), Err(RateLimitError::InvalidLimit));
        assert_eq!(RateLimit::new(1, 0), Err(RateLimitError::InvalidWindow));
    }
}
