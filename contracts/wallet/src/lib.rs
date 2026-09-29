#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol};

/// Storage keys for the wallet contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    Router,
    Token,
}

/// Errors returned by the wallet contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum WalletError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    ZeroAmount = 4,
}

#[contract]
pub struct WalletContract;

#[contractimpl]
impl WalletContract {
    /// Configure the wallet with a distinct owner and router role.
    ///
    /// The owner is the account that ultimately controls the wallet, while the
    /// router is the contract/account permitted to move funds on the owner's
    /// behalf. Both roles are stored separately so authorization can be checked
    /// against either one.
    pub fn initialize(
        env: Env,
        owner: Address,
        router: Address,
        token: Address,
    ) -> Result<(), WalletError> {
        if env.storage().instance().has(&DataKey::Owner) {
            return Err(WalletError::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::Router, &router);
        env.storage().instance().set(&DataKey::Token, &token);

        Ok(())
    }

    /// Return the configured owner address.
    pub fn owner(env: Env) -> Result<Address, WalletError> {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(WalletError::NotInitialized)
    }

    /// Return the configured router address.
    pub fn router(env: Env) -> Result<Address, WalletError> {
        env.storage()
            .instance()
            .get(&DataKey::Router)
            .ok_or(WalletError::NotInitialized)
    }

    /// Return the configured token address.
    pub fn token(env: Env) -> Result<Address, WalletError> {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(WalletError::NotInitialized)
    }

    /// Withdraw `amount` of the configured token to `recipient`.
    ///
    /// Only the configured router or the wallet owner may authorize a
    /// withdrawal. The caller must have authorized this invocation, and the
    /// amount must be strictly positive.
    pub fn withdraw(
        env: Env,
        caller: Address,
        recipient: Address,
        amount: i128,
    ) -> Result<(), WalletError> {
        caller.require_auth();

        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(WalletError::NotInitialized)?;
        let router: Address = env
            .storage()
            .instance()
            .get(&DataKey::Router)
            .ok_or(WalletError::NotInitialized)?;
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(WalletError::NotInitialized)?;

        if caller != owner && caller != router {
            return Err(WalletError::Unauthorized);
        }

        if amount <= 0 {
            return Err(WalletError::ZeroAmount);
        }

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        env.events().publish(
            (Symbol::new(&env, "withdraw"),),
            (recipient, token, amount, env.current_contract_address()),
        );

        Ok(())
    }
}
