#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env, IntoVal, Symbol};

mod payment_contract {
    soroban_sdk::contractimport!(
        file = "../target/wasm32-unknown-unknown/release/payment.wasm"
    );
}

mod caller_contract {
    use soroban_sdk::{contract, contractimpl, Address, Env, IntoVal, Symbol};

    #[contract]
    pub struct CallerContract;

    #[contractimpl]
    impl CallerContract {
        /// Invokes `create_payment` on the payment contract on behalf of `from`.
        /// The caller's authorization is propagated via `require_auth` on the
        /// payment contract, which is satisfied by the `from` address here.
        pub fn invoke_create_payment(
            env: Env,
            payment_contract: Address,
            from: Address,
            to: Address,
            token: Address,
            amount: i128,
        ) -> u32 {
            from.require_auth();
            env.invoke_contract::<u32>(
                &payment_contract,
                &Symbol::new(&env, "create_payment"),
                (from, to, token, amount).into_val(&env),
            )
        }

        /// Invokes `settle_payment` on the payment contract on behalf of `caller`.
        pub fn invoke_settle_payment(
            env: Env,
            payment_contract: Address,
            caller: Address,
            payment_id: u32,
        ) -> bool {
            caller.require_auth();
            env.invoke_contract::<bool>(
                &payment_contract,
                &Symbol::new(&env, "settle_payment"),
                (caller, payment_id).into_val(&env),
            )
        }
    }
}

use caller_contract::{CallerContract, CallerContractClient};

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

fn setup() -> (Env, PaymentContractClient<'static>, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, PaymentContract);
    let client = PaymentContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let from = Address::generate(&env);
    let to = Address::generate(&env);

    let token_id = env.register_stellar_asset_contract(admin.clone());
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    token_admin.mint(&from, &1_000_000);

    (env, client, admin, from, to, token_id)
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
    let (env, client, admin, _from, _to, _token_id) = setup();

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
    let (env, client, admin, _from, _to, _token_id) = setup();

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
    let (env, client, admin, _from, _to, _token_id) = setup();

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
    let (env, client, admin, _from, _to, _token_id) = setup();
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
    let (_env, client, admin, _from, _to, _token_id) = setup();
    assert!(client
        .try_transition_payment(&admin, &9_999, &PaymentStatus::Completed)
        .is_err());
}

#[test]
fn test_transition_emits_status_event() {
    let (env, client, admin, _from, _to, _token_id) = setup();
    let id = payment_in_status(&env, &client, &admin, PaymentStatus::Pending);

    client.transition_payment(&admin, &id, &PaymentStatus::Completed);

    let events = env.events().all();
    let last = events.last().expect("a status event must be emitted");
    assert_eq!(last.0, client.address);
}

#[test]
fn test_cross_contract_create_payment_success() {
    let (env, client, _admin, from, to, token_id) = setup();

    let caller_id = env.register_contract(None, CallerContract);
    let caller = CallerContractClient::new(&env, &caller_id);

    let payment_id = caller.invoke_create_payment(
        &client.address,
        &from,
        &to,
        &token_id,
        &500,
    );

    let payment = client.get_payment(&payment_id);
    assert_eq!(payment.from, from);
    assert_eq!(payment.to, to);
    assert_eq!(payment.amount, 500);
    assert_eq!(payment.token, token_id);
}

#[test]
fn test_cross_contract_settle_payment_success() {
    let (env, client, _admin, from, to, token_id) = setup();

    let caller_id = env.register_contract(None, CallerContract);
    let caller = CallerContractClient::new(&env, &caller_id);

    let payment_id = caller.invoke_create_payment(
        &client.address,
        &from,
        &to,
        &token_id,
        &500,
    );

    let settled = caller.invoke_settle_payment(&client.address, &from, &payment_id);
    assert!(settled);

    let payment = client.get_payment(&payment_id);
    assert!(payment.settled);

    let token_client = token::Client::new(&env, &token_id);
    assert_eq!(token_client.balance(&to), 500);
}

#[test]
fn test_cross_contract_create_payment_authorization_propagates() {
    let (env, client, _admin, from, to, token_id) = setup();

    let caller_id = env.register_contract(None, CallerContract);
    let caller = CallerContractClient::new(&env, &caller_id);

    // Only `from` is authorized; the intermediate contract must forward it.
    env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &from,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &caller_id,
            fn_name: "invoke_create_payment",
            args: (
                client.address.clone(),
                from.clone(),
                to.clone(),
                token_id.clone(),
                500i128,
            )
                .into_val(&env),
            sub_invokes: &[soroban_sdk::testutils::MockAuthInvoke {
                contract: &client.address,
                fn_name: "create_payment",
                args: (from.clone(), to.clone(), token_id.clone(), 500i128).into_val(&env),
                sub_invokes: &[],
            }],
        },
    }]);

    let payment_id = caller.invoke_create_payment(
        &client.address,
        &from,
        &to,
        &token_id,
        &500,
    );

    let payment = client.get_payment(&payment_id);
    assert_eq!(payment.from, from);
}

#[test]
#[should_panic]
fn test_cross_contract_create_payment_unauthorized_rejected() {
    let (env, client, _admin, from, to, token_id) = setup();

    let caller_id = env.register_contract(None, CallerContract);
    let caller = CallerContractClient::new(&env, &caller_id);

    // No auth mocked for `from`; the propagated require_auth must fail.
    env.mock_auths(&[]);

    caller.invoke_create_payment(&client.address, &from, &to, &token_id, &500);
}

#[test]
#[should_panic]
fn test_cross_contract_settle_payment_unauthorized_rejected() {
    let (env, client, _admin, from, to, token_id) = setup();

    let caller_id = env.register_contract(None, CallerContract);
    let caller = CallerContractClient::new(&env, &caller_id);

    let payment_id = caller.invoke_create_payment(
        &client.address,
        &from,
        &to,
        &token_id,
        &500,
    );

    let stranger = Address::generate(&env);
    env.mock_auths(&[]);

    caller.invoke_settle_payment(&client.address, &stranger, &payment_id);
}

#[test]
fn test_cross_contract_create_payment_boundary_amount() {
    let (env, client, _admin, from, to, token_id) = setup();

    let caller_id = env.register_contract(None, CallerContract);
    let caller = CallerContractClient::new(&env, &caller_id);

    // Zero amount is a valid boundary for creation.
    let payment_id = caller.invoke_create_payment(
        &client.address,
        &from,
        &to,
        &token_id,
        &0,
    );

    let payment = client.get_payment(&payment_id);
    assert_eq!(payment.amount, 0);
}

#[test]
#[should_panic]
fn test_cross_contract_create_payment_negative_amount_rejected() {
    let (env, client, _admin, from, to, token_id) = setup();

    let caller_id = env.register_contract(None, CallerContract);
    let caller = CallerContractClient::new(&env, &caller_id);

    caller.invoke_create_payment(&client.address, &from, &to, &token_id, &-1);
}

#[test]
fn test_cross_contract_settle_payment_rollback_on_callee_failure() {
    let (env, client, _admin, from, to, token_id) = setup();

    let caller_id = env.register_contract(None, CallerContract);
    let caller = CallerContractClient::new(&env, &caller_id);

    let payment_id = caller.invoke_create_payment(
        &client.address,
        &from,
        &to,
        &token_id,
        &500,
    );

    // Drain the payer so the callee's token transfer fails during settlement.
    let token_admin = token::StellarAssetClient::new(&env, &token_id);
    token_admin.burn(&from, &1_000_000);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        caller.invoke_settle_payment(&client.address, &from, &payment_id);
    }));
    assert!(result.is_err());

    // The payment must remain unsettled after the callee failure.
    let payment = client.get_payment(&payment_id);
    assert!(!payment.settled);

    let token_client = token::Client::new(&env, &token_id);
    assert_eq!(token_client.balance(&to), 0);
}
}
