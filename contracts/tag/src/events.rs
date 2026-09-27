use soroban_sdk::{contracttype, Address, Env, Symbol};

/// Emitted when a tag is registered.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TagRegistered {
    pub tag: Symbol,
    pub owner: Address,
}

/// Emitted when a tag's owner is changed directly.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TagTransferred {
    pub tag: Symbol,
    pub from: Address,
    pub to: Address,
}

/// Emitted when a two-step ownership transfer is proposed.
/// The current owner remains authoritative until the pending owner accepts.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TagTransferPending {
    pub tag: Symbol,
    pub owner: Address,
    pub pending_owner: Address,
}

/// Emitted when a pending ownership transfer is accepted by the pending owner.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TagTransferAccepted {
    pub tag: Symbol,
    pub from: Address,
    pub to: Address,
}

/// Emitted when a pending ownership transfer is cancelled by the current owner.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TagTransferCancelled {
    pub tag: Symbol,
    pub owner: Address,
    pub pending_owner: Address,
}

pub fn tag_registered(env: &Env, tag: Symbol, owner: Address) {
    env.events().publish(
        (Symbol::new(env, "tag_registered"), tag.clone()),
        TagRegistered { tag, owner },
    );
}

pub fn tag_transferred(env: &Env, tag: Symbol, from: Address, to: Address) {
    env.events().publish(
        (Symbol::new(env, "tag_transferred"), tag.clone()),
        TagTransferred { tag, from, to },
    );
}

pub fn tag_transfer_pending(env: &Env, tag: Symbol, owner: Address, pending_owner: Address) {
    env.events().publish(
        (Symbol::new(env, "tag_transfer_pending"), tag.clone()),
        TagTransferPending {
            tag,
            owner,
            pending_owner,
        },
    );
}

pub fn tag_transfer_accepted(env: &Env, tag: Symbol, from: Address, to: Address) {
    env.events().publish(
        (Symbol::new(env, "tag_transfer_accepted"), tag.clone()),
        TagTransferAccepted { tag, from, to },
    );
}

pub fn tag_transfer_cancelled(env: &Env, tag: Symbol, owner: Address, pending_owner: Address) {
    env.events().publish(
        (Symbol::new(env, "tag_transfer_cancelled"), tag.clone()),
        TagTransferCancelled {
            tag,
            owner,
            pending_owner,
        },
    );
}
