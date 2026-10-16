//! Payment lifecycle status model.
//!
//! Defines the set of statuses a payment can occupy and the allowed
//! transitions between them. The transition table is the single source of
//! truth for the payment state machine and is exercised by the table-driven
//! tests at the bottom of this module.

use soroban_sdk::contracttype;

/// Lifecycle status of a payment.
///
/// Externally visible: serialized as a `u32` discriminant on-chain, so the
/// numeric ordering of these variants is part of the contract ABI and must
/// not be reordered.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentStatus {
    /// Payment has been created but not yet funded.
    Pending = 0,
    /// Funds have been escrowed for the payment.
    Funded = 1,
    /// Payment has been released to the recipient.
    Released = 2,
    /// Payment was cancelled before release.
    Cancelled = 3,
    /// Payment was refunded to the sender.
    Refunded = 4,
    /// Payment has expired without being released.
    Expired = 5,
}

impl PaymentStatus {
    /// Returns `true` if a transition from `self` to `next` is allowed.
    ///
    /// Allowed transitions:
    /// - `Pending -> Funded`
    /// - `Pending -> Cancelled`
    /// - `Pending -> Expired`
    /// - `Funded -> Released`
    /// - `Funded -> Refunded`
    /// - `Funded -> Expired`
    ///
    /// Every other transition is forbidden. Terminal statuses
    /// (`Released`, `Cancelled`, `Refunded`, `Expired`) have no outgoing
    /// transitions.
    pub fn can_transition_to(self, next: PaymentStatus) -> bool {
        matches!(
            (self, next),
            (PaymentStatus::Pending, PaymentStatus::Funded)
                | (PaymentStatus::Pending, PaymentStatus::Cancelled)
                | (PaymentStatus::Pending, PaymentStatus::Expired)
                | (PaymentStatus::Funded, PaymentStatus::Released)
                | (PaymentStatus::Funded, PaymentStatus::Refunded)
                | (PaymentStatus::Funded, PaymentStatus::Expired)
        )
    }

    /// Returns `true` if the status is terminal, i.e. no further transitions
    /// are permitted from it.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            PaymentStatus::Released
                | PaymentStatus::Cancelled
                | PaymentStatus::Refunded
                | PaymentStatus::Expired
        )
    }

    /// Returns every status known to the model, in discriminant order.
    pub fn all() -> [PaymentStatus; 6] {
        [
            PaymentStatus::Pending,
            PaymentStatus::Funded,
            PaymentStatus::Released,
            PaymentStatus::Cancelled,
            PaymentStatus::Refunded,
            PaymentStatus::Expired,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::PaymentStatus;
    use PaymentStatus::*;

    /// Table of every allowed transition in the payment lifecycle.
    const ALLOWED: &[(PaymentStatus, PaymentStatus)] = &[
        (Pending, Funded),
        (Pending, Cancelled),
        (Pending, Expired),
        (Funded, Released),
        (Funded, Refunded),
        (Funded, Expired),
    ];

    #[test]
    fn allowed_transitions_are_permitted() {
        for (from, to) in ALLOWED.iter().copied() {
            assert!(
                from.can_transition_to(to),
                "expected {:?} -> {:?} to be allowed",
                from,
                to
            );
        }
    }

    #[test]
    fn forbidden_transitions_are_rejected() {
        for from in PaymentStatus::all() {
            for to in PaymentStatus::all() {
                let allowed = ALLOWED.contains(&(from, to));
                assert_eq!(
                    from.can_transition_to(to),
                    allowed,
                    "transition {:?} -> {:?} mismatch",
                    from,
                    to
                );
            }
        }
    }

    #[test]
    fn self_transitions_are_forbidden() {
        for status in PaymentStatus::all() {
            assert!(
                !status.can_transition_to(status),
                "self transition {:?} -> {:?} must be forbidden",
                status,
                status
            );
        }
    }

    #[test]
    fn terminal_statuses_have_no_outgoing_transitions() {
        for from in PaymentStatus::all() {
            if from.is_terminal() {
                for to in PaymentStatus::all() {
                    assert!(
                        !from.can_transition_to(to),
                        "terminal {:?} must not transition to {:?}",
                        from,
                        to
                    );
                }
            }
        }
    }

    #[test]
    fn non_terminal_statuses_are_pending_and_funded() {
        assert!(!Pending.is_terminal());
        assert!(!Funded.is_terminal());
        assert!(Released.is_terminal());
        assert!(Cancelled.is_terminal());
        assert!(Refunded.is_terminal());
        assert!(Expired.is_terminal());
    }

    #[test]
    fn all_returns_every_status_once() {
        let all = PaymentStatus::all();
        assert_eq!(all.len(), 6);
        for (i, status) in all.iter().enumerate() {
            assert_eq!(*status as u32, i as u32);
        }
    }
}
