//! Shared Soroban authorization fixtures for contract tests.
//!
//! These helpers configure the test [`Env`]'s mocked authorization so a test
//! can state *who* authorized *which* invocation without hand-building
//! `MockAuth` trees in every crate. They only change what the test host
//! reports as signed; they never bypass or modify a contract's own
//! `require_auth` checks, which still run against the mocked entries.
//!
//! | Helper                  | Mocked authorization                                   | Expected contract outcome        |
//! |-------------------------|--------------------------------------------------------|----------------------------------|
//! | [`authorize_all`]       | every `require_auth` succeeds                          | authorized path proceeds         |
//! | [`unauthorized`]        | no `require_auth` succeeds                             | rejected (auth error)            |
//! | [`authorize_invoke`]    | one address, for one exact `(contract, fn, args)`      | proceeds only for that call      |
//! | [`authorize_delegated`] | owner authorizes a delegate call that sub-invokes a target | proceeds only for that chain |
//!
//! Each helper replaces the previous mock set, so a test should call exactly
//! one helper per invocation it is about to make.

#![cfg(any(test, feature = "testutils"))]

use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
use soroban_sdk::{Address, Env, Val, Vec};

/// Mock every `require_auth` as satisfied.
///
/// Use for the authorized path when the test is not about authorization.
pub fn authorize_all(env: &Env) {
    env.mock_all_auths();
}

/// Mock no authorization at all, so every `require_auth` fails.
///
/// Use for the unauthorized path. Calling this after [`authorize_all`] revokes
/// the earlier mocks.
pub fn unauthorized(env: &Env) {
    env.set_auths(&[]);
}

/// Authorize exactly one invocation: `address` signed for `fn_name` on
/// `contract` with `args`, and nothing else.
///
/// Any other `require_auth` in the call tree, including calls with different
/// arguments, is left unauthorized.
pub fn authorize_invoke(
    env: &Env,
    address: &Address,
    contract: &Address,
    fn_name: &str,
    args: Vec<Val>,
) {
    env.mock_auths(&[MockAuth {
        address,
        invoke: &MockAuthInvoke {
            contract,
            fn_name,
            args,
            sub_invokes: &[],
        },
    }]);
}

/// Authorize a delegated call chain.
///
/// `owner` signs for `delegate` calling `delegate_fn` with `delegate_args`,
/// and the delegate is authorized to make the single sub-invocation
/// `target_fn(target_args)` on `target`. Nothing beyond that chain is
/// authorized, so a test can check that a forwarded call succeeds while a
/// different target or function still fails.
#[allow(clippy::too_many_arguments)]
pub fn authorize_delegated(
    env: &Env,
    owner: &Address,
    delegate: &Address,
    delegate_fn: &str,
    delegate_args: Vec<Val>,
    target: &Address,
    target_fn: &str,
    target_args: Vec<Val>,
) {
    env.mock_auths(&[MockAuth {
        address: owner,
        invoke: &MockAuthInvoke {
            contract: delegate,
            fn_name: delegate_fn,
            args: delegate_args,
            sub_invokes: &[MockAuthInvoke {
                contract: target,
                fn_name: target_fn,
                args: target_args,
                sub_invokes: &[],
            }],
        },
    }]);
}
