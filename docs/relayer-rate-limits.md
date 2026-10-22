# Relayer Submission Rate Limits (Rust/Soroban)

Issue: #808 — Add rate limits to Rust relayer submission.

This document specifies the typed Rust rate-limit layer that guards relayer
submission of Soroban transactions. It defines the trust boundary, privileged
roles, replay behavior, failure-safe state transitions, and the migration,
indexing, monitoring, and rollback expectations. It is the design artifact for
the implementation; the module lives in the relayer crate as
`relayer::rate_limit`.

## Scope

- Applies to the Rust relayer that accepts signed Soroban transaction
  submissions and forwards them to the network.
- Rate limits are enforced **before** any submission side effect (no network
  call, no counter mutation on rejection).
- Out of scope: on-chain contract rate limiting, fee policy, and signer
  binding (tracked separately).

## Trust boundary

- **Untrusted**: the submitter payload (submitter id, submission key, signed
  envelope). All fields are validated and length-bounded before use.
- **Trusted**: the relayer process and its configured limits. Limits are loaded
  from operator-controlled config, never from the request.
- The relayer is the only component that mutates rate-limit state. Submitters
  cannot read or write counters directly.
- Submission keys are treated as opaque, bounded byte strings; they are hashed
  for indexing and never logged in raw form.

## Privileged roles

| Role      | May submit | May configure limits | May reset counters |
|-----------|-----------|----------------------|--------------------|
| Submitter | yes       | no                   | no                 |
| Operator  | yes       | yes (bounded)        | no                 |
| Admin     | no        | yes                  | yes (audited)      |

- Role checks are enforced at the entry point; a submitter presenting an
  operator/admin action is rejected as `Unauthorized`.
- Limit configuration changes are validated (non-zero window, non-zero limit,
  bounded maximum) and are deterministic: the same config yields the same
  decision for the same inputs.
- Admin counter resets require an audit record and are idempotent.

## Typed model

```rust
pub struct RateLimitConfig {
    pub window_secs: u64,      // must be > 0
    pub max_per_window: u32,   // must be > 0
    pub max_submission_key_len: usize,
}

pub struct SubmissionRequest {
    pub submitter: SubmitterId,
    pub submission_key: SubmissionKey, // bounded, hashed for indexing
    pub now: Timestamp,                // injected clock for determinism
}

pub enum RateLimitDecision {
    Allow,
    Reject { reason: RejectReason },
}

pub enum RejectReason {
    LimitExceeded { window_start: Timestamp, count: u32 },
    Unauthorized,
    InvalidConfig,
    InvalidSubmissionKey,
    Replay,
}
```

Validation is deterministic: decisions depend only on `(config, request,
stored state)` and the injected `now`, never on wall-clock reads inside the
module.

## Replay behavior

- Each submission carries a `submission_key`. Keys are tracked per submitter
  within the active window.
- A repeated `submission_key` for the same submitter is rejected as `Replay`
  and does **not** increment the counter (idempotent rejection).
- Keys are retained for at least one window so replays across window
  boundaries are still detected; retention is bounded to avoid unbounded
  growth.
- Replay detection is checked before limit accounting so a replay cannot be
  used to exhaust another submitter's budget.

## Failure-safe state transitions

The check-and-commit is a single atomic step:

1. Validate config and submission key (pure, no mutation).
2. Check replay set (read-only).
3. Compute the window bucket for `now` (pure).
4. If `count + 1 > max_per_window`, return `LimitExceeded` **without** mutating
   state.
5. Otherwise commit counter increment and key insertion together.

If any step fails or the commit is interrupted, no partial counter or key
state is persisted. Window rollover is computed from `now`; stale windows are
pruned lazily and pruning failures never block a valid submission.

## Tests

- **Unit**: config validation (zero window, zero limit, oversized key),
  window bucketing, counter increment, replay rejection.
- **Boundary**: `count == max_per_window - 1` allows; `count == max_per_window`
  rejects; first request of a new window allows.
- **Unauthorized**: submitter attempting operator/admin actions is rejected.
- **Replay**: duplicate key rejected without counter increment; replay across
  window boundary still rejected.
- **Failure**: injected commit failure leaves counters and replay set
  unchanged; subsequent valid submission succeeds.
- **Property**: for any sequence of requests, accepted count per window never
  exceeds `max_per_window`, and rejected requests never mutate state.
- **Local network**: relayer against a local Soroban network enforces limits
  end-to-end and returns typed rejections.

## Migration

- Ship the module behind a config flag; default limits are conservative and
  documented.
- Existing submitters are seeded with empty counters; no backfill required.
- Rollout: enable in staging, observe rejections, then enable in production.

## Indexing

- Counters are indexed by `(submitter, window_start)`.
- Replay keys are indexed by `(submitter, hash(submission_key))` with TTL of
  one window.
- Indexes are rebuilt deterministically from persisted state on restart.

## Monitoring

- Emit metrics: `relayer.rate_limit.allowed`, `relayer.rate_limit.rejected`
  (labeled by `RejectReason`), and `relayer.rate_limit.window_utilization`.
- Alert on sustained `LimitExceeded` for a single submitter and on any
  `Unauthorized` spike.
- Logs redact raw submission keys; only hashed identifiers appear.

## Rollback

- Disable the config flag to bypass enforcement without redeploying code.
- Counters and replay sets are additive state; disabling the flag leaves them
  inert and safe to prune.
- Admin counter reset is available for recovery and is audited.
