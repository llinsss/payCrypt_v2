use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Symbol};

/// Storage keys for the wallet contract.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    Router,
    PendingRouter,
    PendingRouterAt,
}

/// Delay (in ledgers) that must elapse between proposing a new router and
/// activating it. Gives users a window to withdraw before a new router takes
/// effect.
pub const ROUTER_ROTATION_DELAY: u32 = 17_280; // ~1 day at 5s/ledger

#[contract]
pub struct WalletContract;

#[contractimpl]
impl WalletContract {
    /// Initialize the wallet with an owner and an initial router.
    pub fn init(env: Env, owner: Address, router: Address) {
        owner.require_auth();
        if env.storage().instance().has(&DataKey::Owner) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Owner, &owner);
        env.storage().instance().set(&DataKey::Router, &router);
    }

    /// Current active router.
    pub fn router(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Router).unwrap()
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
    pub fn commit_router(env: Env) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();

        let new_router: Address = env
            .storage()
            .instance()
            .get(&DataKey::PendingRouter)
            .expect("no pending router");
        let proposed_at: u32 = env
            .storage()
            .instance()
            .get(&DataKey::PendingRouterAt)
            .unwrap();

        let now = env.ledger().sequence();
        if now < proposed_at + ROUTER_ROTATION_DELAY {
            panic!("rotation delay not elapsed");
        }

        let old_router: Address = env.storage().instance().get(&DataKey::Router).unwrap();
        env.storage().instance().set(&DataKey::Router, &new_router);
        env.storage().instance().remove(&DataKey::PendingRouter);
        env.storage().instance().remove(&DataKey::PendingRouterAt);

        env.events().publish(
            (Symbol::new(&env, "router_committed"),),
            (old_router, new_router),
        );
    }

    /// Owner may cancel a pending rotation before it is committed.
    pub fn cancel_router_rotation(env: Env) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        env.storage().instance().remove(&DataKey::PendingRouter);
        env.storage().instance().remove(&DataKey::PendingRouterAt);
    }

    /// Withdraw funds. Always uses the currently active router, so user
    /// withdrawals remain available during a pending rotation.
    pub fn withdraw(env: Env, to: Address, amount: i128) {
        let owner: Address = env.storage().instance().get(&DataKey::Owner).unwrap();
        owner.require_auth();
        let router: Address = env.storage().instance().get(&DataKey::Router).unwrap();
        token::Client::new(&env, &router).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );
    }
}
