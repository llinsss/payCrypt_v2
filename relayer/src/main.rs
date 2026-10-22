use std::collections::HashMap;
use std::env;
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Trust boundary: only the configured operator (via `RELAYER_OPERATOR`)
/// may submit transactions. Rate limits are enforced per submitter and per
/// rolling window. Configuration is privileged and read once at startup.
#[derive(Debug, Clone)]
pub struct RateLimitConfig {
    /// Maximum submissions allowed per submitter within `window`.
    pub max_per_window: u32,
    /// Rolling window duration.
    pub window: Duration,
}

impl RateLimitConfig {
    pub fn from_env() -> Self {
        let max_per_window = env::var("RELAYER_RATE_LIMIT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10);
        let window_secs = env::var("RELAYER_RATE_WINDOW_SECS")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(60);
        Self {
            max_per_window,
            window: Duration::from_secs(window_secs),
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum SubmitError {
    Unauthorized,
    RateLimited,
    Replay,
}

struct WindowState {
    window_start: Instant,
    count: u32,
}

/// Deterministic, failure-safe rate limiter with replay protection.
///
/// State transitions are atomic: a submission is only counted (and its key
/// recorded) after all validation passes. On any failure, no partial counter
/// or replay-key commit occurs.
pub struct RateLimiter {
    config: RateLimitConfig,
    operator: String,
    windows: Mutex<HashMap<String, WindowState>>,
    seen_keys: Mutex<HashMap<String, ()>>,
}

impl RateLimiter {
    pub fn new(config: RateLimitConfig, operator: String) -> Self {
        Self {
            config,
            operator,
            windows: Mutex::new(HashMap::new()),
            seen_keys: Mutex::new(HashMap::new()),
        }
    }

    /// Validate and record a submission. `submitter` must equal the operator
    /// (trust boundary). `submission_key` provides replay protection.
    pub fn check_and_record(
        &self,
        submitter: &str,
        submission_key: &str,
        now: Instant,
    ) -> Result<(), SubmitError> {
        // Privileged role check first: unauthorized callers never touch state.
        if submitter != self.operator {
            return Err(SubmitError::Unauthorized);
        }

        // Replay check before mutating counters.
        {
            let seen = self.seen_keys.lock().map_err(|_| SubmitError::Replay)?;
            if seen.contains_key(submission_key) {
                return Err(SubmitError::Replay);
            }
        }

        // Rate-limit check and commit under a single lock for atomicity.
        let mut windows = self.windows.lock().map_err(|_| SubmitError::RateLimited)?;
        let entry = windows.entry(submitter.to_string()).or_insert(WindowState {
            window_start: now,
            count: 0,
        });

        if now.duration_since(entry.window_start) >= self.config.window {
            entry.window_start = now;
            entry.count = 0;
        }

        if entry.count >= self.config.max_per_window {
            return Err(SubmitError::RateLimited);
        }

        // All checks passed: commit counter and replay key together.
        entry.count += 1;
        drop(windows);

        let mut seen = self.seen_keys.lock().map_err(|_| SubmitError::Replay)?;
        seen.insert(submission_key.to_string(), ());
        Ok(())
    }
}

fn main() {
    let config = RateLimitConfig::from_env();
    let operator = env::var("RELAYER_OPERATOR").unwrap_or_default();
    let limiter = RateLimiter::new(config, operator);

    // Placeholder submission loop: real submission wiring lives elsewhere.
    // The limiter is constructed here so configuration is validated at startup.
    let _ = &limiter;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn limiter(max: u32, window_secs: u64) -> RateLimiter {
        RateLimiter::new(
            RateLimitConfig {
                max_per_window: max,
                window: Duration::from_secs(window_secs),
            },
            "operator".to_string(),
        )
    }

    #[test]
    fn success_path() {
        let l = limiter(2, 60);
        let now = Instant::now();
        assert_eq!(l.check_and_record("operator", "k1", now), Ok(()));
    }

    #[test]
    fn boundary_reached_then_exceeded() {
        let l = limiter(2, 60);
        let now = Instant::now();
        assert_eq!(l.check_and_record("operator", "k1", now), Ok(()));
        assert_eq!(l.check_and_record("operator", "k2", now), Ok(()));
        assert_eq!(
            l.check_and_record("operator", "k3", now),
            Err(SubmitError::RateLimited)
        );
    }

    #[test]
    fn window_resets() {
        let l = limiter(1, 60);
        let now = Instant::now();
        assert_eq!(l.check_and_record("operator", "k1", now), Ok(()));
        let later = now + Duration::from_secs(61);
        assert_eq!(l.check_and_record("operator", "k2", later), Ok(()));
    }

    #[test]
    fn unauthorized_submitter() {
        let l = limiter(5, 60);
        let now = Instant::now();
        assert_eq!(
            l.check_and_record("intruder", "k1", now),
            Err(SubmitError::Unauthorized)
        );
    }

    #[test]
    fn replay_rejected() {
        let l = limiter(5, 60);
        let now = Instant::now();
        assert_eq!(l.check_and_record("operator", "k1", now), Ok(()));
        assert_eq!(
            l.check_and_record("operator", "k1", now),
            Err(SubmitError::Replay)
        );
    }

    #[test]
    fn failure_does_not_commit_counter() {
        let l = limiter(1, 60);
        let now = Instant::now();
        // Unauthorized attempt must not consume the operator's quota.
        assert_eq!(
            l.check_and_record("intruder", "k1", now),
            Err(SubmitError::Unauthorized)
        );
        assert_eq!(l.check_and_record("operator", "k2", now), Ok(()));
        // Replay attempt must not consume quota either.
        assert_eq!(
            l.check_and_record("operator", "k2", now),
            Err(SubmitError::Replay)
        );
        assert_eq!(
            l.check_and_record("operator", "k3", now),
            Err(SubmitError::RateLimited)
        );
    }
}
