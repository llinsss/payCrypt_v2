#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Symbol};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TagError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    NoPendingTransfer = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tag {
    pub owner: Address,
    pub name: Symbol,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingTransfer {
    pub from: Address,
    pub to: Address,
}

#[contract]
pub struct TagContract;

#[contractimpl]
impl TagContract {
    pub fn initialize(env: Env, owner: Address, name: Symbol) -> Result<(), TagError> {
        if env.storage().instance().has(&Symbol::new(&env, "tag")) {
            return Err(TagError::AlreadyInitialized);
        }
        let tag = Tag { owner, name };
        env.storage().instance().set(&Symbol::new(&env, "tag"), &tag);
        Ok(())
    }

    pub fn get_tag(env: Env) -> Result<Tag, TagError> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "tag"))
            .ok_or(TagError::NotInitialized)
    }

    pub fn get_pending_transfer(env: Env) -> Option<PendingTransfer> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "pending"))
    }

    /// Propose a two-step ownership transfer. The current owner remains
    /// authoritative until the pending owner accepts. A new proposal replaces
    /// any existing pending transfer.
    pub fn propose_transfer(env: Env, to: Address) -> Result<(), TagError> {
        let tag: Tag = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "tag"))
            .ok_or(TagError::NotInitialized)?;
        tag.owner.require_auth();

        let pending = PendingTransfer {
            from: tag.owner.clone(),
            to: to.clone(),
        };
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "pending"), &pending);

        env.events().publish(
            (Symbol::new(&env, "transfer_pending"),),
            (tag.owner, to),
        );
        Ok(())
    }

    /// Cancel a pending transfer. Only the current owner may cancel.
    pub fn cancel_transfer(env: Env) -> Result<(), TagError> {
        let tag: Tag = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "tag"))
            .ok_or(TagError::NotInitialized)?;
        tag.owner.require_auth();

        let pending: PendingTransfer = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "pending"))
            .ok_or(TagError::NoPendingTransfer)?;

        env.storage().instance().remove(&Symbol::new(&env, "pending"));

        env.events().publish(
            (Symbol::new(&env, "transfer_cancelled"),),
            (pending.from, pending.to),
        );
        Ok(())
    }

    /// Accept a pending transfer. Only the pending destination may accept.
    /// Ownership only changes here, on acceptance.
    pub fn accept_transfer(env: Env) -> Result<(), TagError> {
        let mut tag: Tag = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "tag"))
            .ok_or(TagError::NotInitialized)?;

        let pending: PendingTransfer = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "pending"))
            .ok_or(TagError::NoPendingTransfer)?;

        pending.to.require_auth();

        tag.owner = pending.to.clone();
        env.storage().instance().set(&Symbol::new(&env, "tag"), &tag);
        env.storage().instance().remove(&Symbol::new(&env, "pending"));

        env.events().publish(
            (Symbol::new(&env, "transfer_accepted"),),
            (pending.from, pending.to),
        );
        Ok(())
    }
}
