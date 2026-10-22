#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, BytesN, Env, Symbol};

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
    Paused,
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
    Paused = 14,
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

/// Instance TTL threshold (ledgers). The instance entry is renewed only once
/// its remaining TTL drops below this value, keeping per-invocation work and
/// storage writes bounded.
pub const INSTANCE_TTL_THRESHOLD: u32 = 120_960; // ~7 days at 5s/ledger

/// Instance TTL target (ledgers) applied on renewal. All wallet state, including
/// pending router proposals and recovery slots, lives in instance storage, so
/// renewing this TTL keeps that state from expiring.
pub const INSTANCE_TTL_EXTEND_TO: u32 = 518_400; // ~30 days at 5s/ledger

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
        extend_instance_ttl(&env);

        Ok(())
    }

    /// Renew the wallet's instance TTL. Permissionless: it only extends the
    /// lifetime of existing state and never changes it. Fails with
    /// `WalletError::NotInitialized` before `initialize`.
    pub fn extend_ttl(env: Env) -> Result<(), WalletError> {
        if !env.storage().instance().has(&DataKey::Owner) {
            return Err(WalletError::NotInitialized);
        }
        extend_instance_ttl(&env);

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

    /// Whether the wallet is currently paused. While paused, asset-moving
    /// methods (e.g. `withdraw`) reject with `WalletError::Paused`, but
    /// recovery and governance operations remain callable.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    /// Emergency pause: block asset-moving methods. Only the owner may pause.
    /// Recovery and governance operations remain available while paused.
    pub fn pause(env: Env) -> Result<(), WalletError> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(WalletError::NotInitialized)?;
        owner.require_auth();

        env.storage().instance().set(&DataKey::Paused, &true);
        env.events()
            .publish((Symbol::new(&env, "paused"),), owner);

        Ok(())
    }

    /// Lift the emergency pause. Only the owner may unpause.
    pub fn unpause(env: Env) -> Result<(), WalletError> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(WalletError::NotInitialized)?;
        owner.require_auth();

        env.storage().instance().set(&DataKey::Paused, &false);
        env.events()
            .publish((Symbol::new(&env, "unpaused"),), owner);

        Ok(())
    }

    /// Pending router (if a rotation is in progress).
    pub fn pending_router(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::PendingRouter)
    }

    /// Step 1 of two-step rotation: owner proposes a new router.
    /// The new router is NOT active until `commit_router` is called after the
    /// mandatory delay. Only the owner may propose.
    pub fn propose_router(env: Env, new_router: Address) {
        let owner = load_owner(&env);
        owner.require_auth();
        extend_instance_ttl(&env);

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
        let owner = load_owner(&env);
        owner.require_auth();
        extend_instance_ttl(&env);

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
        let owner = load_owner(&env);
        owner.require_auth();
        extend_instance_ttl(&env);
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
        let owner = load_owner(&env);
        owner.require_auth();
        extend_instance_ttl(&env);

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
        let owner = load_owner(&env);
        owner.require_auth();
        extend_instance_ttl(&env);

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
            (Symbol::new(&env, "router_recovery_committed"),),
            (old_router, new_router),
        );

        Ok(())
    }

    /// Move `amount` of the configured token from the wallet to `to`.
    ///
    /// This is an asset-moving method: it is blocked while the wallet is
    /// paused, returning `WalletError::Paused`. The router must authorize the
    /// call.
    pub fn withdraw(env: Env, to: Address, amount: i128) -> Result<(), WalletError> {
        if Self::is_paused(env.clone()) {
            return Err(WalletError::Paused);
        }
        if amount <= 0 {
            return Err(WalletError::ZeroAmount);
        }

        let router: Address = env
            .storage()
            .instance()
            .get(&DataKey::Router)
            .ok_or(WalletError::NotInitialized)?;
        router.require_auth();
        extend_instance_ttl(&env);

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(WalletError::NotInitialized)?;
        let client = token::Client::new(&env, &token_addr);
        client.transfer(&env.current_contract_address(), &to, &amount);

        env.events().publish(
            (Symbol::new(&env, "withdraw"),),
            (to, amount),
        );

        Ok(())
    }

    /// Replace the contract Wasm with the uploaded code identified by
    /// `new_wasm_hash`. Only the owner may upgrade. Storage is preserved across
    /// the upgrade, so pending router proposals, recovery slots, and the pause
    /// flag carry over unchanged. The new Wasm must already be uploaded to the
    /// ledger.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        let owner = load_owner(&env);
        owner.require_auth();
        extend_instance_ttl(&env);

        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());

        env.events().publish(
            (Symbol::new(&env, "upgraded"),),
            (owner, new_wasm_hash),
        );
    }
}

/// Load the owner, failing with `WalletError::NotInitialized` before `initialize`.
fn load_owner(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Owner)
        .unwrap_or_else(|| env.panic_with_error(WalletError::NotInitialized))
}

/// Renew the instance TTL when it drops below [`INSTANCE_TTL_THRESHOLD`].
/// Instance storage holds all wallet state, so this single call keeps the
/// whole wallet, including pending router configuration, from expiring.
fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}
