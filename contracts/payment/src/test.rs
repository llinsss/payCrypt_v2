#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

/// A single row in the payment lifecycle transition table.
///
/// `from` is the current status, `to` is the requested status, and `allowed`
/// records whether the transition is part of the payment state machine.
struct TransitionCase {
    from: PaymentStatus,
    to: PaymentStatus,
    allowed: bool,
}

/// The full set of payment lifecycle statuses.
fn all_statuses() -> [PaymentStatus; 5] {
    [
        PaymentStatus::Pending,
        PaymentStatus::Completed,
        PaymentStatus::Failed,
        PaymentStatus::Refunded,
        PaymentStatus::Cancelled,
    ]
}

/// Table of every allowed and forbidden transition in the payment lifecycle.
///
/// Allowed transitions:
/// - Pending -> Completed
/// - Pending -> Failed
/// - Pending -> Cancelled
/// - Completed -> Refunded
///
/// Every other pair (including self-transitions and transitions out of a
/// terminal status) is forbidden.
fn transition_table() -> [TransitionCase; 25] {
    let mut cases = [TransitionCase {
        from: PaymentStatus::Pending,
        to: PaymentStatus::Pending,
        allowed: false,
    }; 25];

    let statuses = all_statuses();
    let mut i = 0;
    while i < statuses.len() {
        let mut j = 0;
        while j < statuses.len() {
            let from = statuses[i];
            let to = statuses[j];
            let allowed = matches!(
                (from, to),
                (PaymentStatus::Pending, PaymentStatus::Completed)
                    | (PaymentStatus::Pending, PaymentStatus::Failed)
                    | (PaymentStatus::Pending, PaymentStatus::Cancelled)
                    | (PaymentStatus::Completed, PaymentStatus::Refunded)
            );
            cases[i * statuses.len() + j] = TransitionCase { from, to, allowed };
            j += 1;
        }
        i += 1;
    }

    cases
}

fn setup() -> (Env, PaymentContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register_contract(None, PaymentContract);
    let client = PaymentContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    client.initialize(&admin);
    (env, client, admin)
}

/// Drives a freshly created payment into `status` using only allowed
/// transitions, so the table can be exercised from every reachable state.
fn payment_in_status(
    env: &Env,
    client: &PaymentContractClient,
    admin: &Address,
    status: PaymentStatus,
) -> u64 {
    let payer = Address::generate(env);
    let payee = Address::generate(env);
    let id = client.create_payment(admin, &payer, &payee, &1_000);

    match status {
        PaymentStatus::Pending => {}
        PaymentStatus::Completed => {
            client.complete_payment(admin, &id);
        }
        PaymentStatus::Failed => {
            client.fail_payment(admin, &id);
        }
        PaymentStatus::Cancelled => {
            client.cancel_payment(admin, &id);
        }
        PaymentStatus::Refunded => {
            client.complete_payment(admin, &id);
            client.refund_payment(admin, &id);
        }
    }

    id
}

#[test]
fn test_transition_table_covers_all_status_pairs() {
    let cases = transition_table();
    assert_eq!(cases.len(), all_statuses().len() * all_statuses().len());

    let allowed = cases.iter().filter(|c| c.allowed).count();
    assert_eq!(allowed, 4, "exactly four transitions are allowed");
}

#[test]
fn test_allowed_transitions_succeed() {
    let (env, client, admin) = setup();

    for case in transition_table().iter().filter(|c| c.allowed) {
        let id = payment_in_status(&env, &client, &admin, case.from);
        let result = client.try_transition_payment(&admin, &id, &case.to);
        assert!(
            result.is_ok(),
            "expected {:?} -> {:?} to be allowed",
            case.from,
            case.to
        );
        assert_eq!(client.get_payment(&id).status, case.to);
    }
}

#[test]
fn test_forbidden_transitions_fail() {
    let (env, client, admin) = setup();

    for case in transition_table().iter().filter(|c| !c.allowed) {
        let id = payment_in_status(&env, &client, &admin, case.from);
        let result = client.try_transition_payment(&admin, &id, &case.to);
        assert!(
            result.is_err(),
            "expected {:?} -> {:?} to be forbidden",
            case.from,
            case.to
        );
        // A rejected transition must not mutate the stored status.
        assert_eq!(client.get_payment(&id).status, case.from);
    }
}

#[test]
fn test_terminal_statuses_have_no_outgoing_transitions() {
    let (env, client, admin) = setup();

    for from in [
        PaymentStatus::Failed,
        PaymentStatus::Refunded,
        PaymentStatus::Cancelled,
    ] {
        for to in all_statuses() {
            let id = payment_in_status(&env, &client, &admin, from);
            assert!(
                client.try_transition_payment(&admin, &id, &to).is_err(),
                "terminal status {:?} must not transition to {:?}",
                from,
                to
            );
        }
    }
}

#[test]
fn test_transition_requires_admin_authorization() {
    let (env, client, admin) = setup();
    let id = payment_in_status(&env, &client, &admin, PaymentStatus::Pending);
    let attacker = Address::generate(&env);

    // Without mocked auth the unauthorized caller must be rejected.
    env.set_auths(&[]);
    assert!(client
        .try_transition_payment(&attacker, &id, &PaymentStatus::Completed)
        .is_err());
    assert_eq!(client.get_payment(&id).status, PaymentStatus::Pending);
}

#[test]
fn test_transition_unknown_payment_fails() {
    let (_env, client, admin) = setup();
    assert!(client
        .try_transition_payment(&admin, &9_999, &PaymentStatus::Completed)
        .is_err());
}

#[test]
fn test_transition_emits_status_event() {
    let (env, client, admin) = setup();
    let id = payment_in_status(&env, &client, &admin, PaymentStatus::Pending);

    client.transition_payment(&admin, &id, &PaymentStatus::Completed);

    let events = env.events().all();
    let last = events.last().expect("a status event must be emitted");
    assert_eq!(last.0, client.address);
}
