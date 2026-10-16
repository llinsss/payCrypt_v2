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
