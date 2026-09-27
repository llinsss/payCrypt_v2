use soroban_sdk::{contracttype, Address, Env};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tag {
    pub owner: Address,
    pub name: soroban_sdk::String,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingTransfer {
    pub new_owner: Address,
}

const TAG_KEY: &str = "tag";
const PENDING_KEY: &str = "pending";

pub fn get_tag(env: &Env) -> Option<Tag> {
    env.storage().instance().get(&TAG_KEY)
}

pub fn set_tag(env: &Env, tag: &Tag) {
    env.storage().instance().set(&TAG_KEY, tag);
}

pub fn get_pending(env: &Env) -> Option<PendingTransfer> {
    env.storage().instance().get(&PENDING_KEY)
}

pub fn set_pending(env: &Env, pending: &PendingTransfer) {
    env.storage().instance().set(&PENDING_KEY, pending);
}

pub fn clear_pending(env: &Env) {
    env.storage().instance().remove(&PENDING_KEY);
}
