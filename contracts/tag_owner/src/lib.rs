#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env, Symbol};

/// Delay (in ledgers) that must elapse between initiating a recovery and
/// completing it. Bounds how quickly an owner can be replaced.
const RECOVERY_DELAY_LEDGERS: u32 = 17_280; // ~1 day at 5s/ledger

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RecoveryStatus {
    None,
    Pending,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecoveryRequest {
    pub new_owner: Address,
    pub initiated_at: u32,
    pub executable_at: u32,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    NoRecoveryPending = 4,
    RecoveryAlreadyPending = 5,
    DelayNotElapsed = 6,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Owner,
    Recovery,
}

#[contract]
pub struct TagOwnerContract;

#[contractimpl]
impl TagOwnerContract {
    /// Initialize the contract with an owner. Can only be called once.
    pub fn initialize(env: Env, owner: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Owner) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Owner, &owner);
        Ok(())
    }

    /// Current owner of the tag.
    pub fn owner(env: Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)
    }

    /// Initiate a recovery of an inaccessible owner account.
    ///
    /// Only the current owner may initiate recovery. A delay is enforced
    /// before the recovery can be completed. Emits `recovery_init`.
    pub fn initiate_recovery(env: Env, new_owner: Address) -> Result<(), Error> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;
        owner.require_auth();

        if env.storage().instance().has(&DataKey::Recovery) {
            return Err(Error::RecoveryAlreadyPending);
        }

        let now = env.ledger().sequence();
        let request = RecoveryRequest {
            new_owner: new_owner.clone(),
            initiated_at: now,
            executable_at: now + RECOVERY_DELAY_LEDGERS,
        };
        env.storage().instance().set(&DataKey::Recovery, &request);

        env.events().publish(
            (Symbol::new(&env, "recovery_init"), owner),
            (new_owner, request.executable_at),
        );
        Ok(())
    }

    /// Cancel a pending recovery. Only the current owner may cancel.
    /// Emits `recovery_cancel`.
    pub fn cancel_recovery(env: Env) -> Result<(), Error> {
        let owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;
        owner.require_auth();

        if !env.storage().instance().has(&DataKey::Recovery) {
            return Err(Error::NoRecoveryPending);
        }
        env.storage().instance().remove(&DataKey::Recovery);

        env.events()
            .publish((Symbol::new(&env, "recovery_cancel"), owner), ());
        Ok(())
    }

    /// Complete a pending recovery after the delay has elapsed.
    ///
    /// The pending `new_owner` must authorize. Emits `recovery_done`.
    pub fn complete_recovery(env: Env) -> Result<(), Error> {
        let request: RecoveryRequest = env
            .storage()
            .instance()
            .get(&DataKey::Recovery)
            .ok_or(Error::NoRecoveryPending)?;

        if env.ledger().sequence() < request.executable_at {
            return Err(Error::DelayNotElapsed);
        }

        request.new_owner.require_auth();

        let old_owner: Address = env
            .storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(Error::NotInitialized)?;

        env.storage()
            .instance()
            .set(&DataKey::Owner, &request.new_owner);
        env.storage().instance().remove(&DataKey::Recovery);

        env.events().publish(
            (Symbol::new(&env, "recovery_done"), old_owner),
            request.new_owner,
        );
        Ok(())
    }

    /// View the pending recovery request, if any.
    pub fn pending_recovery(env: Env) -> Option<RecoveryRequest> {
        env.storage().instance().get(&DataKey::Recovery)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, testutils::Ledger, Env};

    fn setup() -> (Env, TagOwnerContractClient<'static>, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register_contract(None, TagOwnerContract);
        let client = TagOwnerContractClient::new(&env, &contract_id);
        let owner = Address::generate(&env);
        client.initialize(&owner);
        (env, client, owner)
    }

    #[test]
    fn recovery_success_after_delay() {
        let (env, client, owner) = setup();
        let new_owner = Address::generate(&env);

        client.initiate_recovery(&new_owner);
        assert_eq!(client.owner(), owner);

        env.ledger().with_mut(|l| l.sequence_number += RECOVERY_DELAY_LEDGERS);
        client.complete_recovery();
        assert_eq!(client.owner(), new_owner);
        assert!(client.pending_recovery().is_none());
    }

    #[test]
    fn recovery_requires_owner_auth() {
        let (env, client, _owner) = setup();
        let new_owner = Address::generate(&env);
        env.mock_auths(&[]);
        assert_eq!(
            client.try_initiate_recovery(&new_owner),
            Err(Ok(Error::Unauthorized))
        );
    }

    #[test]
    fn recovery_delay_boundary() {
        let (env, client, _owner) = setup();
        let new_owner = Address::generate(&env);
        client.initiate_recovery(&new_owner);

        // One ledger before the delay elapses must fail.
        env.ledger().with_mut(|l| l.sequence_number += RECOVERY_DELAY_LEDGERS - 1);
        assert_eq!(client.try_complete_recovery(), Err(Ok(Error::DelayNotElapsed)));

        env.ledger().with_mut(|l| l.sequence_number += 1);
        client.complete_recovery();
        assert_eq!(client.owner(), new_owner);
    }

    #[test]
    fn recovery_cancellable_by_owner() {
        let (env, client, owner) = setup();
        let new_owner = Address::generate(&env);
        client.initiate_recovery(&new_owner);
        client.cancel_recovery();
        assert!(client.pending_recovery().is_none());
        assert_eq!(client.owner(), owner);

        env.ledger().with_mut(|l| l.sequence_number += RECOVERY_DELAY_LEDGERS);
        assert_eq!(client.try_complete_recovery(), Err(Ok(Error::NoRecoveryPending)));
    }

    #[test]
    fn recovery_failure_cases() {
        let (env, client, _owner) = setup();
        let new_owner = Address::generate(&env);

        // No pending recovery yet.
        assert_eq!(client.try_complete_recovery(), Err(Ok(Error::NoRecoveryPending)));
        assert_eq!(client.try_cancel_recovery(), Err(Ok(Error::NoRecoveryPending)));

        client.initiate_recovery(&new_owner);
        // Duplicate initiation rejected.
        assert_eq!(
            client.try_initiate_recovery(&new_owner),
            Err(Ok(Error::RecoveryAlreadyPending))
        );
    }
}
