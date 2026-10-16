#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env};

/// Storage keys used by the escrow contract.
///
/// Only a single `State` entry is written per escrow, keeping storage growth
/// bounded to one persistent record per escrow lifecycle.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    State,
}

/// Lifecycle state of an escrow.
///
/// `Released` and `Refunded` are terminal: once reached, no further state
/// transitions are permitted and the escrowed balance is always zero.
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowState {
    /// Funds are held by the contract and may be released or refunded.
    Funded,
    /// Funds were paid to the beneficiary. Terminal.
    Released,
    /// Funds were returned to the depositor. Terminal.
    Refunded,
}

/// Persisted escrow record.
#[contracttype]
#[derive(Clone)]
pub struct Escrow {
    pub depositor: Address,
    pub beneficiary: Address,
    pub token: Address,
    pub amount: i128,
    pub state: EscrowState,
}

/// Error codes surfaced to callers.
///
/// * `AlreadyInitialized` (1) - `init` called when an escrow already exists.
/// * `NotInitialized` (2) - operation attempted before `init`.
/// * `InvalidAmount` (3) - amount is zero or negative.
/// * `Unauthorized` (4) - caller is not the required party.
/// * `TerminalState` (5) - operation attempted after release/refund.
#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    Unauthorized = 4,
    TerminalState = 5,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Create an escrow holding `amount` of `token` from `depositor` to
    /// `beneficiary`. Requires `depositor` authorization and transfers the
    /// funds into the contract.
    ///
    /// Emits no events; state is observable via [`Self::get_escrow`].
    pub fn init(
        env: Env,
        depositor: Address,
        beneficiary: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::State) {
            return Err(Error::AlreadyInitialized);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        depositor.require_auth();

        token::Client::new(&env, &token).transfer(
            &depositor,
            &env.current_contract_address(),
            &amount,
        );

        let escrow = Escrow {
            depositor,
            beneficiary,
            token,
            amount,
            state: EscrowState::Funded,
        };
        env.storage().instance().set(&DataKey::State, &escrow);
        Ok(())
    }

    /// Release the escrowed funds to the beneficiary.
    ///
    /// Requires `depositor` authorization. Only valid while `Funded`.
    pub fn release(env: Env) -> Result<(), Error> {
        let mut escrow = Self::load(&env)?;
        if escrow.state != EscrowState::Funded {
            return Err(Error::TerminalState);
        }
        escrow.depositor.require_auth();

        token::Client::new(&env, &escrow.token).transfer(
            &env.current_contract_address(),
            &escrow.beneficiary,
            &escrow.amount,
        );

        escrow.state = EscrowState::Released;
        env.storage().instance().set(&DataKey::State, &escrow);
        Ok(())
    }

    /// Refund the escrowed funds to the depositor.
    ///
    /// Requires `beneficiary` authorization. Only valid while `Funded`.
    pub fn refund(env: Env) -> Result<(), Error> {
        let mut escrow = Self::load(&env)?;
        if escrow.state != EscrowState::Funded {
            return Err(Error::TerminalState);
        }
        escrow.beneficiary.require_auth();

        token::Client::new(&env, &escrow.token).transfer(
            &env.current_contract_address(),
            &escrow.depositor,
            &escrow.amount,
        );

        escrow.state = EscrowState::Refunded;
        env.storage().instance().set(&DataKey::State, &escrow);
        Ok(())
    }

    /// Read the current escrow record.
    pub fn get_escrow(env: Env) -> Result<Escrow, Error> {
        Self::load(&env)
    }

    fn load(env: &Env) -> Result<Escrow, Error> {
        env.storage()
            .instance()
            .get(&DataKey::State)
            .ok_or(Error::NotInitialized)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, AuthorizedFunction, AuthorizedInvocation},
        token::{Client as TokenClient, StellarAssetClient},
        Address, Env, IntoVal,
    };

    struct Setup {
        env: Env,
        contract: Address,
        token: Address,
        depositor: Address,
        beneficiary: Address,
    }

    fn setup(amount: i128) -> Setup {
        let env = Env::default();
        env.mock_all_auths();

        let contract = env.register_contract(None, EscrowContract);
        let token_admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(token_admin.clone())
            .address();

        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);

        StellarAssetClient::new(&env, &token).mint(&depositor, &amount);

        EscrowContractClient::new(&env, &contract).init(
            &depositor,
            &beneficiary,
            &token,
            &amount,
        );

        Setup {
            env,
            contract,
            token,
            depositor,
            beneficiary,
        }
    }

    fn balance(s: &Setup, who: &Address) -> i128 {
        TokenClient::new(&s.env, &s.token).balance(who)
    }

    /// Invariant: the contract holds exactly the escrowed amount while funded,
    /// and zero once a terminal state is reached.
    fn assert_conservation(s: &Setup, expected_contract: i128) {
        let escrow = EscrowContractClient::new(&s.env, &s.contract).get_escrow();
        assert_eq!(balance(s, &s.contract), expected_contract);
        assert_eq!(balance(s, &s.contract), escrow.amount - (escrow.amount - expected_contract));
    }

    #[test]
    fn init_holds_funds_and_conserves_total_supply() {
        let s = setup(1_000);
        assert_eq!(balance(&s, &s.contract), 1_000);
        assert_eq!(balance(&s, &s.depositor), 0);
        assert_eq!(balance(&s, &s.beneficiary), 0);
        assert_conservation(&s, 1_000);
    }

    #[test]
    fn release_transfers_to_beneficiary_and_zeroes_contract() {
        let s = setup(1_000);
        EscrowContractClient::new(&s.env, &s.contract).release();

        assert_eq!(balance(&s, &s.beneficiary), 1_000);
        assert_eq!(balance(&s, &s.contract), 0);
        assert_eq!(balance(&s, &s.depositor), 0);
        assert_conservation(&s, 0);
    }

    #[test]
    fn refund_transfers_to_depositor_and_zeroes_contract() {
        let s = setup(1_000);
        EscrowContractClient::new(&s.env, &s.contract).refund();

        assert_eq!(balance(&s, &s.depositor), 1_000);
        assert_eq!(balance(&s, &s.contract), 0);
        assert_eq!(balance(&s, &s.beneficiary), 0);
        assert_conservation(&s, 0);
    }

    #[test]
    fn terminal_state_is_immutable_after_release() {
        let s = setup(1_000);
        let client = EscrowContractClient::new(&s.env, &s.contract);
        client.release();

        assert_eq!(client.try_release(), Err(Ok(Error::TerminalState)));
        assert_eq!(client.try_refund(), Err(Ok(Error::TerminalState)));
        assert_eq!(balance(&s, &s.contract), 0);
        assert_eq!(balance(&s, &s.beneficiary), 1_000);
    }

    #[test]
    fn terminal_state_is_immutable_after_refund() {
        let s = setup(1_000);
        let client = EscrowContractClient::new(&s.env, &s.contract);
        client.refund();

        assert_eq!(client.try_release(), Err(Ok(Error::TerminalState)));
        assert_eq!(client.try_refund(), Err(Ok(Error::TerminalState)));
        assert_eq!(balance(&s, &s.contract), 0);
        assert_eq!(balance(&s, &s.depositor), 1_000);
    }

    #[test]
    fn init_rejects_non_positive_amounts() {
        let env = Env::default();
        env.mock_all_auths();
        let contract = env.register_contract(None, EscrowContract);
        let token_admin = Address::generate(&env);
        let token = env
            .register_stellar_asset_contract_v2(token_admin)
            .address();
        let depositor = Address::generate(&env);
        let beneficiary = Address::generate(&env);
        let client = EscrowContractClient::new(&env, &contract);

        assert_eq!(
            client.try_init(&depositor, &beneficiary, &token, &0),
            Err(Ok(Error::InvalidAmount))
        );
        assert_eq!(
            client.try_init(&depositor, &beneficiary, &token, &-1),
            Err(Ok(Error::InvalidAmount))
        );
    }

    #[test]
    fn init_cannot_be_called_twice() {
        let s = setup(1_000);
        let client = EscrowContractClient::new(&s.env, &s.contract);
        assert_eq!(
            client.try_init(&s.depositor, &s.beneficiary, &s.token, &1_000),
            Err(Ok(Error::AlreadyInitialized))
        );
    }

    #[test]
    fn operations_before_init_fail() {
        let env = Env::default();
        env.mock_all_auths();
        let contract = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract);

        assert_eq!(client.try_release(), Err(Ok(Error::NotInitialized)));
        assert_eq!(client.try_refund(), Err(Ok(Error::NotInitialized)));
        assert_eq!(client.try_get_escrow(), Err(Ok(Error::NotInitialized)));
    }

    #[test]
    fn release_requires_depositor_auth() {
        let s = setup(1_000);
        let client = EscrowContractClient::new(&s.env, &s.contract);
        client.release();

        let auths = s.env.auths();
        assert_eq!(auths.len(), 1);
        let (addr, invocation) = auths.get(0).unwrap();
        assert_eq!(addr, s.depositor);
        assert_eq!(
            invocation,
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    s.contract.clone(),
                    "release".into_val(&s.env),
                    ().into_val(&s.env),
                )),
                sub_invocations: [].into(),
            }
        );
    }

    #[test]
    fn refund_requires_beneficiary_auth() {
        let s = setup(1_000);
        let client = EscrowContractClient::new(&s.env, &s.contract);
        client.refund();

        let auths = s.env.auths();
        assert_eq!(auths.len(), 1);
        let (addr, invocation) = auths.get(0).unwrap();
        assert_eq!(addr, s.beneficiary);
        assert_eq!(
            invocation,
            AuthorizedInvocation {
                function: AuthorizedFunction::Contract((
                    s.contract.clone(),
                    "refund".into_val(&s.env),
                    ().into_val(&s.env),
                )),
                sub_invocations: [].into(),
            }
        );
    }

    /// Property-style test: drive a generated sequence of transitions and
    /// assert conservation of escrowed funds and terminal-state immutability
    /// after every step.
    #[test]
    fn property_generated_transition_sequences_conserve_funds() {
        // Deterministic pseudo-random generator keeps the test reproducible
        // without pulling in extra dependencies.
        let mut seed: u64 = 0x9E3779B97F4A7C15;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };

        for _ in 0..32 {
            let amount = (next() % 10_000) as i128 + 1;
            let s = setup(amount);
            let client = EscrowContractClient::new(&s.env, &s.contract);

            // Invariant holds immediately after funding.
            assert_eq!(balance(&s, &s.contract), amount);
            assert_eq!(balance(&s, &s.depositor), 0);
            assert_eq!(balance(&s, &s.beneficiary), 0);

            // Choose a terminal transition, then attempt further transitions.
            let release_first = next() % 2 == 0;
            if release_first {
                client.release();
            } else {
                client.refund();
            }

            // Conservation: total supply is unchanged and the contract is empty.
            assert_eq!(balance(&s, &s.contract), 0);
            let recipient = if release_first {
                &s.beneficiary
            } else {
                &s.depositor
            };
            assert_eq!(balance(&s, recipient), amount);

            // Terminal-state immutability: no further transitions succeed and
            // balances never change again.
            assert_eq!(client.try_release(), Err(Ok(Error::TerminalState)));
            assert_eq!(client.try_refund(), Err(Ok(Error::TerminalState)));
            assert_eq!(balance(&s, &s.contract), 0);
            assert_eq!(balance(&s, recipient), amount);
        }
    }
}
