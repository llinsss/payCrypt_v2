//! Malicious-token test doubles for Soroban contracts.
//!
//! These doubles implement the SEP-41 token interface but deliberately misbehave
//! so that value-moving contracts can be exercised against hostile tokens.
//!
//! # Supported vs. rejected behaviors
//!
//! Each double documents, per behavior, whether a well-behaved consumer is
//! expected to *reject* it (i.e. the consumer safely handles / blocks the
//! misbehavior) or *support* it (i.e. the consumer tolerates it and continues).
//! Consumers should assert the documented outcome in their own tests.
//!
//! | Double                  | Behavior                         | Expected consumer outcome |
//! |-------------------------|----------------------------------|---------------------------|
//! | `FailingToken`          | `transfer`/`transfer_from` revert| reject (propagate error)  |
//! | `ReentrantToken`        | re-enter via `transfer` callback | reject (guard / no reentry)|
//! | `FeeOnTransferToken`    | deduct fee on transfer           | support (balance delta)   |
//! | `PausableToken`         | revert while paused              | reject (propagate error)  |
//! | `RevokingToken`         | revoke allowance on transfer     | support (allowance = 0)   |
//! | `EdgeCaseToken`         | zero / max / overflow returns    | reject (checked math)     |
//!
//! The doubles are intentionally dependency-free (only `soroban-sdk`) so they can
//! be reused across crates via `contracts/test-support`.

#![cfg(any(test, feature = "testutils"))]

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String};

/// Shared storage keys for the doubles.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Paused,
    FeeBps,
    RevokeOnTransfer,
    ReenterOnTransfer,
    EdgeMode,
}

/// Edge-case return modes for [`EdgeCaseToken`].
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum EdgeMode {
    /// Return `0` for every balance/allowance query.
    Zero,
    /// Return `i128::MAX` for every balance/allowance query.
    Max,
    /// Return a negative value (overflow bait) for balance queries.
    Negative,
}

fn read_admin(e: &Env) -> Address {
    e.storage().instance().get(&DataKey::Admin).unwrap()
}

fn read_balance(e: &Env, id: &Address) -> i128 {
    e.storage().persistent().get(&(id.clone(),)).unwrap_or(0)
}

fn write_balance(e: &Env, id: &Address, amount: i128) {
    e.storage().persistent().set(&(id.clone(),), &amount);
}

fn read_allowance(e: &Env, from: &Address, spender: &Address) -> i128 {
    e.storage()
        .persistent()
        .get(&(from.clone(), spender.clone()))
        .unwrap_or(0)
}

fn write_allowance(e: &Env, from: &Address, spender: &Address, amount: i128) {
    e.storage()
        .persistent()
        .set(&(from.clone(), spender.clone()), &amount);
}

/// A token whose `transfer` and `transfer_from` always revert.
///
/// Consumers are expected to **reject** the failure by propagating the error
/// and leaving their own state unchanged.
#[contract]
pub struct FailingToken;

#[contractimpl]
impl FailingToken {
    pub fn initialize(e: Env, admin: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn mint(e: Env, to: Address, amount: i128) {
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    pub fn balance(e: Env, id: Address) -> i128 {
        read_balance(&e, &id)
    }

    pub fn transfer(_e: Env, _from: Address, _to: Address, _amount: i128) {
        panic!("FailingToken: transfer reverted")
    }

    pub fn transfer_from(_e: Env, _spender: Address, _from: Address, _to: Address, _amount: i128) {
        panic!("FailingToken: transfer_from reverted")
    }

    pub fn approve(e: Env, from: Address, spender: Address, amount: i128) {
        write_allowance(&e, &from, &spender, amount);
    }

    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&e, &from, &spender)
    }
}

/// A token that re-enters the caller through a transfer callback.
///
/// When `ReenterOnTransfer` is set, `transfer` invokes `to` as a contract with
/// a `on_transfer` callback before mutating balances. Consumers are expected to
/// **reject** reentrancy via a reentrancy guard or by mutating state before the
/// external call.
#[contract]
pub struct ReentrantToken;

#[contractimpl]
impl ReentrantToken {
    pub fn initialize(e: Env, admin: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::ReenterOnTransfer, &false);
    }

    pub fn set_reenter(e: Env, enabled: bool) {
        e.storage().instance().set(&DataKey::ReenterOnTransfer, &enabled);
    }

    pub fn mint(e: Env, to: Address, amount: i128) {
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    pub fn balance(e: Env, id: Address) -> i128 {
        read_balance(&e, &id)
    }

    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let reenter: bool = e
            .storage()
            .instance()
            .get(&DataKey::ReenterOnTransfer)
            .unwrap_or(false);
        if reenter {
            // Re-enter the recipient before balances are updated.
            let _ = e.try_invoke_contract::<(), soroban_sdk::Error>(
                &to,
                &soroban_sdk::Symbol::new(&e, "on_transfer"),
                soroban_sdk::vec![&e, from.clone().into_val(&e), amount.into_val(&e)],
            );
        }
        let from_bal = read_balance(&e, &from);
        write_balance(&e, &from, from_bal - amount);
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    pub fn transfer_from(e: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let allowed = read_allowance(&e, &from, &spender);
        write_allowance(&e, &from, &spender, allowed - amount);
        Self::transfer(e, from, to, amount);
    }

    pub fn approve(e: Env, from: Address, spender: Address, amount: i128) {
        write_allowance(&e, &from, &spender, amount);
    }

    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&e, &from, &spender)
    }
}

/// A token that deducts a fee (in basis points) on every transfer.
///
/// Consumers are expected to **support** fee-on-transfer tokens by measuring the
/// actual received balance delta rather than trusting the requested amount.
#[contract]
pub struct FeeOnTransferToken;

#[contractimpl]
impl FeeOnTransferToken {
    pub fn initialize(e: Env, admin: Address, fee_bps: u32) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::FeeBps, &fee_bps);
    }

    pub fn mint(e: Env, to: Address, amount: i128) {
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    pub fn balance(e: Env, id: Address) -> i128 {
        read_balance(&e, &id)
    }

    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let fee_bps: u32 = e.storage().instance().get(&DataKey::FeeBps).unwrap_or(0);
        let fee = amount * (fee_bps as i128) / 10_000;
        let net = amount - fee;
        write_balance(&e, &from, read_balance(&e, &from) - amount);
        write_balance(&e, &to, read_balance(&e, &to) + net);
    }

    pub fn transfer_from(e: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let allowed = read_allowance(&e, &from, &spender);
        write_allowance(&e, &from, &spender, allowed - amount);
        Self::transfer(e, from, to, amount);
    }

    pub fn approve(e: Env, from: Address, spender: Address, amount: i128) {
        write_allowance(&e, &from, &spender, amount);
    }

    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&e, &from, &spender)
    }
}

/// A pausable token that reverts all value-moving calls while paused.
///
/// Consumers are expected to **reject** paused transfers by propagating the
/// error and not mutating their own state.
#[contract]
pub struct PausableToken;

#[contractimpl]
impl PausableToken {
    pub fn initialize(e: Env, admin: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Paused, &false);
    }

    pub fn set_paused(e: Env, paused: bool) {
        read_admin(&e).require_auth();
        e.storage().instance().set(&DataKey::Paused, &paused);
    }

    pub fn mint(e: Env, to: Address, amount: i128) {
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    pub fn balance(e: Env, id: Address) -> i128 {
        read_balance(&e, &id)
    }

    fn ensure_not_paused(e: &Env) {
        let paused: bool = e.storage().instance().get(&DataKey::Paused).unwrap_or(false);
        if paused {
            panic!("PausableToken: paused")
        }
    }

    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        Self::ensure_not_paused(&e);
        write_balance(&e, &from, read_balance(&e, &from) - amount);
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    pub fn transfer_from(e: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        Self::ensure_not_paused(&e);
        let allowed = read_allowance(&e, &from, &spender);
        write_allowance(&e, &from, &spender, allowed - amount);
        write_balance(&e, &from, read_balance(&e, &from) - amount);
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    pub fn approve(e: Env, from: Address, spender: Address, amount: i128) {
        write_allowance(&e, &from, &spender, amount);
    }

    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&e, &from, &spender)
    }
}

/// A token that revokes the spender's allowance on every `transfer_from`.
///
/// Consumers are expected to **support** this behavior: after a transfer the
/// allowance is zero, so a second transfer without re-approval must fail.
#[contract]
pub struct RevokingToken;

#[contractimpl]
impl RevokingToken {
    pub fn initialize(e: Env, admin: Address) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::RevokeOnTransfer, &true);
    }

    pub fn mint(e: Env, to: Address, amount: i128) {
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    pub fn balance(e: Env, id: Address) -> i128 {
        read_balance(&e, &id)
    }

    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        write_balance(&e, &from, read_balance(&e, &from) - amount);
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    pub fn transfer_from(e: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let allowed = read_allowance(&e, &from, &spender);
        write_balance(&e, &from, read_balance(&e, &from) - amount);
        write_balance(&e, &to, read_balance(&e, &to) + amount);
        let revoke: bool = e
            .storage()
            .instance()
            .get(&DataKey::RevokeOnTransfer)
            .unwrap_or(true);
        if revoke {
            write_allowance(&e, &from, &spender, 0);
        } else {
            write_allowance(&e, &from, &spender, allowed - amount);
        }
    }

    pub fn approve(e: Env, from: Address, spender: Address, amount: i128) {
        write_allowance(&e, &from, &spender, amount);
    }

    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 {
        read_allowance(&e, &from, &spender)
    }
}

/// A token that returns edge-case values (zero, max, negative) from queries.
///
/// Consumers are expected to **reject** negative/overflow values via checked
/// arithmetic and to handle zero/max without panicking.
#[contract]
pub struct EdgeCaseToken;

#[contractimpl]
impl EdgeCaseToken {
    pub fn initialize(e: Env, admin: Address, mode: EdgeMode) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::EdgeMode, &mode);
    }

    pub fn set_mode(e: Env, mode: EdgeMode) {
        e.storage().instance().set(&DataKey::EdgeMode, &mode);
    }

    pub fn mint(e: Env, to: Address, amount: i128) {
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    fn mode(e: &Env) -> EdgeMode {
        e.storage()
            .instance()
            .get(&DataKey::EdgeMode)
            .unwrap_or(EdgeMode::Zero)
    }

    pub fn balance(e: Env, id: Address) -> i128 {
        match Self::mode(&e) {
            EdgeMode::Zero => 0,
            EdgeMode::Max => i128::MAX,
            EdgeMode::Negative => -1,
        }
    }

    pub fn transfer(e: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        // Deliberately unchecked: overflow bait for consumers using checked math.
        write_balance(&e, &from, read_balance(&e, &from) - amount);
        write_balance(&e, &to, read_balance(&e, &to) + amount);
    }

    pub fn transfer_from(e: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let allowed = read_allowance(&e, &from, &spender);
        write_allowance(&e, &from, &spender, allowed - amount);
        Self::transfer(e, from, to, amount);
    }

    pub fn approve(e: Env, from: Address, spender: Address, amount: i128) {
        write_allowance(&e, &from, &spender, amount);
    }

    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 {
        match Self::mode(&e) {
            EdgeMode::Zero => 0,
            EdgeMode::Max => i128::MAX,
            EdgeMode::Negative => -1,
        }
    }

    pub fn name(e: Env) -> String {
        String::from_str(&e, "EdgeCaseToken")
    }
}
