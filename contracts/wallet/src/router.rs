//! Safe router rotation for Rust wallets.
//!
//! A compromised or obsolete router must be replaceable without giving
//! arbitrary callers a drain path. Rotation is therefore two-step:
//!
//! 1. An authorized admin/owner *proposes* a new router. The proposal is
//!    recorded together with the earliest time it may be committed.
//! 2. After a mandatory delay has elapsed, an authorized admin/owner
//!    *commits* the proposal, activating the new router.
//!
//! User withdrawals are never gated on the router, so they remain available
//! throughout the migration window.

use std::collections::BTreeMap;

/// Mandatory delay (in seconds) between proposing and committing a rotation.
pub const ROTATION_DELAY_SECS: u64 = 48 * 60 * 60;

/// Errors returned by the rotation flow.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RotationError {
    /// The caller is not an authorized admin/owner.
    Unauthorized,
    /// No rotation has been proposed.
    NoPendingRotation,
    /// The mandatory delay has not yet elapsed.
    DelayNotElapsed { ready_at: u64, now: u64 },
    /// The proposed router is the currently active router.
    AlreadyActive,
}

/// A pending, not-yet-active router rotation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingRotation {
    /// The router that will become active on commit.
    pub new_router: String,
    /// The router that was active when the rotation was proposed.
    pub old_router: String,
    /// Earliest timestamp at which the rotation may be committed.
    pub ready_at: u64,
}

/// Wallet router state with two-step, delayed rotation.
#[derive(Debug, Clone)]
pub struct RouterRotation {
    active_router: String,
    pending: Option<PendingRotation>,
    admins: BTreeMap<String, ()>,
}

impl RouterRotation {
    /// Create a new rotation manager with `initial_router` active and
    /// `admins` authorized to propose/commit rotations.
    pub fn new(initial_router: impl Into<String>, admins: impl IntoIterator<Item = String>) -> Self {
        Self {
            active_router: initial_router.into(),
            pending: None,
            admins: admins.into_iter().map(|a| (a, ())).collect(),
        }
    }

    /// The currently active router.
    pub fn active_router(&self) -> &str {
        &self.active_router
    }

    /// The pending rotation, if any.
    pub fn pending(&self) -> Option<&PendingRotation> {
        self.pending.as_ref()
    }

    fn is_admin(&self, caller: &str) -> bool {
        self.admins.contains_key(caller)
    }

    /// Step 1: propose a new router. Only an authorized admin/owner may call
    /// this. The proposal becomes committable after [`ROTATION_DELAY_SECS`].
    pub fn propose(
        &mut self,
        caller: &str,
        new_router: impl Into<String>,
        now: u64,
    ) -> Result<&PendingRotation, RotationError> {
        if !self.is_admin(caller) {
            return Err(RotationError::Unauthorized);
        }
        let new_router = new_router.into();
        if new_router == self.active_router {
            return Err(RotationError::AlreadyActive);
        }
        self.pending = Some(PendingRotation {
            new_router,
            old_router: self.active_router.clone(),
            ready_at: now.saturating_add(ROTATION_DELAY_SECS),
        });
        Ok(self.pending.as_ref().expect("just set"))
    }

    /// Step 2: commit the pending rotation once the delay has elapsed. Only an
    /// authorized admin/owner may call this. The old router is deactivated and
    /// the new router becomes active.
    pub fn commit(&mut self, caller: &str, now: u64) -> Result<&str, RotationError> {
        if !self.is_admin(caller) {
            return Err(RotationError::Unauthorized);
        }
        let pending = self.pending.as_ref().ok_or(RotationError::NoPendingRotation)?;
        if now < pending.ready_at {
            return Err(RotationError::DelayNotElapsed {
                ready_at: pending.ready_at,
                now,
            });
        }
        let pending = self.pending.take().expect("checked above");
        self.active_router = pending.new_router;
        Ok(&self.active_router)
    }

    /// Cancel a pending rotation before it is committed. Only an authorized
    /// admin/owner may call this.
    pub fn cancel(&mut self, caller: &str) -> Result<(), RotationError> {
        if !self.is_admin(caller) {
            return Err(RotationError::Unauthorized);
        }
        self.pending = None;
        Ok(())
    }

    /// Whether `router` is permitted to route user withdrawals. Withdrawals
    /// are always allowed through the active router, including during a
    /// pending migration, so users are never locked out.
    pub fn can_route_withdrawals(&self, router: &str) -> bool {
        router == self.active_router
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manager() -> RouterRotation {
        RouterRotation::new("router-old", vec!["admin".to_string()])
    }

    #[test]
    fn unauthorized_callers_cannot_rotate() {
        let mut m = manager();
        assert_eq!(m.propose("attacker", "router-evil", 0), Err(RotationError::Unauthorized));
        assert_eq!(m.commit("attacker", u64::MAX), Err(RotationError::Unauthorized));
        assert_eq!(m.active_router(), "router-old");
    }

    #[test]
    fn commit_requires_delay() {
        let mut m = manager();
        m.propose("admin", "router-new", 1_000).unwrap();
        assert_eq!(
            m.commit("admin", 1_000),
            Err(RotationError::DelayNotElapsed {
                ready_at: 1_000 + ROTATION_DELAY_SECS,
                now: 1_000,
            })
        );
        assert_eq!(m.active_router(), "router-old");
        m.commit("admin", 1_000 + ROTATION_DELAY_SECS).unwrap();
        assert_eq!(m.active_router(), "router-new");
    }

    #[test]
    fn permissions_hold_at_every_transition() {
        let mut m = manager();
        assert!(m.can_route_withdrawals("router-old"));
        assert!(!m.can_route_withdrawals("router-new"));

        m.propose("admin", "router-new", 0).unwrap();
        // During the migration window the old router still serves withdrawals.
        assert!(m.can_route_withdrawals("router-old"));
        assert!(!m.can_route_withdrawals("router-new"));

        m.commit("admin", ROTATION_DELAY_SECS).unwrap();
        assert!(!m.can_route_withdrawals("router-old"));
        assert!(m.can_route_withdrawals("router-new"));
    }

    #[test]
    fn withdrawals_available_throughout_migration() {
        let mut m = manager();
        m.propose("admin", "router-new", 0).unwrap();
        // Withdrawals remain routable via the active router at all times.
        assert!(m.can_route_withdrawals(m.active_router()));
        m.commit("admin", ROTATION_DELAY_SECS).unwrap();
        assert!(m.can_route_withdrawals(m.active_router()));
    }
}
