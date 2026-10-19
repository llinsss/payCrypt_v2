#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env, Symbol};

/// Storage keys for the wallet contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    Router,
    PendingRouter,
    PendingRouterAt,
    Token,
    WithdrawLimit,
    PendingWithdrawLimit,
    PendingWithdrawLimitAt,
    RecoveryRouter,
    RecoveryRouterAt,
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
    ReentrancyDetected = 5,
    InsufficientBalance = 6,
    LimitExceeded = 7,
    NoPendingLimit = 8,
    LimitDelayNotElapsed = 9,
    NoPendingRouter = 10,
    RouterDelayNotElapsed = 11,
    NoRecoveryRouter = 12,
    RecoveryDelayNotElapsed = 13,
}

/// Delay (in ledgers) that must elapse between proposing a new router and
/// activating it. Gives users a window to withdraw before a new router takes
/// effect.
pub const ROUTER_ROTATION_DELAY: u32 = 17_280; // ~1 day at 5s/ledger

/// Delay (in ledgers) that must elapse between proposing a recovery router and
/// activating it. Recovery is used when the current router is lost or
/// compromised; the same delay window applies so users can react.
pub const ROUTER_RECOVERY_DELAY: u32 = 17_280; // ~1 day at 5s/ledger

/// Delay (in ledgers) that must elapse between proposing a new per-transaction
/// withdrawal limit and activating it. Gives users a window to observe and
/// react to a limit change before it takes effect.
pub const WITHDRAW_LIMIT_DELAY: u32 = 17_280; // ~1 day at 5s/ledger

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

    /// Pending router (if a rotation is in progress).
    pub fn pending_router(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingRouter)
    }

    /// Step 1 of two-step rotation: owner proposes a new router.
    /// The new router is NOT active until `commit_router` is called after the
    /// mandatory delay. Only the owner may propose.
    pub fn propose_router(env: Env, new_router: Address) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();

        let now = env.ledger().sequence();
        env.storage().instance().set(&DataKey::PendingRouter, &new_router);
        env.storage()
            .instance()
            .set(&DataKey::PendingRouterAt, &now);

        env.events().publish(
            (Symbol::new(&env, "router_proposed"),),
            (new_router, now),
        );
    }

    /// Step 2 of two-step rotation: owner activates the proposed router once
    /// the mandatory delay has elapsed. The old router remains active until
    /// this succeeds, so withdrawals keep working throughout the window.
    pub fn commit_router(env: Env) -> Result<(), WalletError> {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();

        let new_router: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingRouter)
            .ok_or(WalletError::NoPendingRouter)?;
        let proposed_at: u32 = env
            .storage()
            .instance()
            .get(&DataKey::PendingRouterAt)
            .unwrap();

        let now = env.ledger().sequence();
        if now < proposed_at + ROUTER_ROTATION_DELAY {
            return Err(WalletError::RouterDelayNotElapsed);
        }

        let old_router: Address = env.storage().instance().get(&DataKey::Router).unwrap();
        env.storage().instance().set(&DataKey::Router, &new_router);
        env.storage().instance().remove(&DataKey::PendingRouter);
        env.storage().instance().remove(&DataKey::PendingRouterAt);

        env.events().publish(
            (Symbol::new(&env, "router_committed"),),
            (old_router, new_router),
        );

        Ok(())
    }

    /// Owner may cancel a pending rotation before it is committed.
    pub fn cancel_router_rotation(env: Env) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        env.storage().instance().remove(&DataKey::PendingRouter);
        env.storage().instance().remove(&DataKey::PendingRouterAt);
    }

    /// Pending recovery router (if a recovery is in progress).
    pub fn pending_recovery_router(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::RecoveryRouter)
    }

    /// Step 1 of router recovery: owner proposes a replacement router when the
    /// current router is lost or compromised. Recovery uses its own pending
    /// slot so it does not clobber an in-flight rotation, and it is subject to
    /// the same mandatory delay before activation. Only the owner may propose.
    pub fn propose_router_recovery(env: Env, new_router: Address) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();

        let now = env.ledger().sequence();
        env.storage()
            .instance()
            .set(&DataKey::RecoveryRouter, &new_router);
        env.storage()
            .instance()
            .set(&DataKey::RecoveryRouterAt, &now);

        env.events().publish(
            (Symbol::new(&env, "router_recovery_proposed"),),
            (new_router, now),
        );
    }

    /// Step 2 of router recovery: owner activates the proposed recovery router
    /// once the mandatory delay has elapsed. The old router remains active
    /// until this succeeds, preserving the delay protection. Any in-flight
    /// rotation is cleared so the recovered router is authoritative.
    pub fn commit_router_recovery(env: Env) -> Result<(), WalletError> {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();

        let new_router: Address = env
            .storage()
            .instance()
            .get(&DataKey::RecoveryRouter)
            .ok_or(WalletError::NoRecoveryRouter)?;
        let proposed_at: u32 = env
            .storage()
            .instance()
            .get(&DataKey::RecoveryRouterAt)
            .unwrap();

        let now = env.ledger().sequence();
        if now < proposed_at + ROUTER_RECOVERY_DELAY {
            return Err(WalletError::RecoveryDelayNotElapsed);
        }

        let old_router: Address = env.storage().instance().get(&DataKey::Router).unwrap();
        env.storage().instance().set(&DataKey::Router, &new_router);
        env.storage().instance().remove(&DataKey::RecoveryRouter);
        env.storage().instance().remove(&DataKey::RecoveryRouterAt);
        env.storage().instance().remove(&DataKey::PendingRouter);
        env.storage().instance().remove(&DataKey::PendingRouterAt);

        env.events().publish(
            (Symbol::new(&env, "router_recovered"),),
            (old_router, new_router),
        );

        Ok(())
    }

    /// Owner may cancel a pending recovery before it is committed.
    pub fn cancel_router_recovery(env: Env) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        env.storage().instance().remove(&DataKey::RecoveryRouter);
        env.storage().instance().remove(&DataKey::RecoveryRouterAt);
    }

    /// Return the currently active per-transaction withdrawal limit, if any.
    /// A `None` value means no upper bound is enforced.
    pub fn withdraw_limit(env: Env) -> Option<i128> {
        env.storage().instance().get(&DataKey::WithdrawLimit)
    }

    /// Pending withdrawal limit (if a limit change is in progress).
    pub fn pending_withdraw_limit(env: Env) -> Option<i128> {
        env.storage().instance().get(&DataKey::PendingWithdrawLimit)
    }

    /// Step 1 of two-step limit change: owner proposes a new per-transaction
    /// withdrawal limit. The new limit is NOT active until `commit_withdraw_limit`
    /// is called after the mandatory delay. Only the owner (governance) may
    /// propose. A limit of `0` disables the bound.
    pub fn propose_withdraw_limit(env: Env, limit: i128) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();

        if limit < 0 {
            panic!("limit must be non-negative");
        }

        let now = env.ledger().sequence();
        env.storage()
            .instance()
            .set(&DataKey::PendingWithdrawLimit, &limit);
        env.storage()
            .instance()
            .set(&DataKey::PendingWithdrawLimitAt, &now);

        env.events().publish(
            (Symbol::new(&env, "withdraw_limit_proposed"),),
            (limit, now),
        );
    }

    /// Step 2 of two-step limit change: owner activates the proposed limit once
    /// the mandatory delay has elapsed. The old limit remains in effect until
    /// this succeeds.
    pub fn commit_withdraw_limit(env: Env) -> Result<(), WalletError> {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();

        let new_limit: i128 = env
            .storage()
            .instance()
            .get(&DataKey::PendingWithdrawLimit)
            .ok_or(WalletError::NoPendingLimit)?;
        let proposed_at: u32 = env
            .storage()
            .instance()
            .get(&DataKey::PendingWithdrawLimitAt)
            .unwrap();

        let now = env.ledger().sequence();
        if now < proposed_at + WITHDRAW_LIMIT_DELAY {
            return Err(WalletError::LimitDelayNotElapsed);
        }

        let old_limit: Option<i128> = env.storage().instance().get(&DataKey::WithdrawLimit);
        env.storage().instance().set(&DataKey::WithdrawLimit, &new_limit);
        env.storage().instance().remove(&DataKey::PendingWithdrawLimit);
        env.storage().instance()

/* … truncated 3335 chars — edit only what you need near the top … */
