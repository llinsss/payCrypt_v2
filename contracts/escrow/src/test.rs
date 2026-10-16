#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env};

fn setup(env: &Env) -> (Address, Address, Address, Address) {
    let contract_id = env.register_contract(None, EscrowContract);
    let depositor = Address::generate(env);
    let beneficiary = Address::generate(env);
    let token_admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    (contract_id, depositor, beneficiary, token_id)
}

#[test]
fn release_transfers_to_beneficiary() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.release();

    assert_eq!(token::Client::new(&env, &token_id).balance(&beneficiary), 100);
    assert_eq!(client.get().state, EscrowState::Released);
}

#[test]
fn cancel_refunds_depositor() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.cancel();

    assert_eq!(token::Client::new(&env, &token_id).balance(&depositor), 100);
    assert_eq!(client.get().state, EscrowState::Cancelled);
}

#[test]
fn expire_after_expiry_ledger() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 5));

    assert_eq!(client.try_expire(), Err(Ok(EscrowError::NotExpired)));

    env.ledger().set_sequence_number(env.ledger().sequence() + 5);
    client.expire();

    assert_eq!(token::Client::new(&env, &token_id).balance(&depositor), 100);
    assert_eq!(client.get().state, EscrowState::Expired);
}

#[test]
fn terminal_state_blocks_further_transitions() {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));
    client.release();

    assert_eq!(client.try_cancel(), Err(Ok(EscrowError::NotCreated)));
    assert_eq!(client.try_release(), Err(Ok(EscrowError::NotCreated)));
}

/// Deterministic pseudo-random generator so generated transition sequences are
/// reproducible across runs without pulling in extra dependencies.
struct Lcg(u64);

impl Lcg {
    fn new(seed: u64) -> Self {
        Lcg(seed)
    }

    fn next(&mut self) -> u64 {
        // Numerical Recipes LCG constants.
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0
    }

    fn below(&mut self, bound: u64) -> u64 {
        self.next() % bound
    }
}

/// Actions a generated sequence may attempt against an escrow.
#[derive(Clone, Copy, Debug)]
enum Action {
    Release,
    Cancel,
    Expire,
}

/// Runs a generated sequence of transitions and asserts the escrow invariants
/// after every step:
/// - the escrow holds exactly `amount` while non-terminal and zero once terminal;
/// - the sum of depositor + beneficiary balances is conserved (no funds minted
///   or burned by the escrow);
/// - terminal states are immutable (no further transition succeeds).
fn run_sequence(seed: u64, amount: i128, expiry_delta: u32, actions: &[Action]) {
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);
    let token = token::Client::new(&env, &token_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &amount);
    client.create(
        &depositor,
        &beneficiary,
        &token_id,
        &amount,
        &(env.ledger().sequence() + expiry_delta),
    );

    // Conservation baseline: total supply held by the two parties is fixed.
    let total = token.balance(&depositor) + token.balance(&beneficiary);
    assert_eq!(total, amount, "seed {seed}: funds not fully escrowed on create");
    assert_eq!(token.balance(&contract_id), amount, "seed {seed}: escrow balance mismatch");

    let mut rng = Lcg::new(seed);
    let mut terminal = false;

    for (i, action) in actions.iter().enumerate() {
        // Advance the ledger by a bounded amount so expiry boundaries are hit.
        let jump = rng.below(4) as u32;
        env.ledger().set_sequence_number(env.ledger().sequence() + jump);

        let result = match action {
            Action::Release => client.try_release(),
            Action::Cancel => client.try_cancel(),
            Action::Expire => client.try_expire(),
        };

        let state = client.get().state;
        let is_terminal = matches!(
            state,
            EscrowState::Released | EscrowState::Cancelled | EscrowState::Expired
        );

        if terminal {
            // Terminal-state immutability: every later transition must fail and
            // must not move any funds.
            assert!(result.is_err(), "seed {seed} step {i}: transition after terminal state succeeded");
            assert_eq!(state, client.get().state, "seed {seed} step {i}: terminal state mutated");
        } else if result.is_ok() {
            assert!(is_terminal, "seed {seed} step {i}: successful transition left non-terminal state");
        }

        // Conservation of escrowed funds across release and refund.
        let depositor_balance = token.balance(&depositor);
        let beneficiary_balance = token.balance(&beneficiary);
        assert_eq!(
            depositor_balance + beneficiary_balance,
            total,
            "seed {seed} step {i}: funds not conserved"
        );

        if is_terminal {
            assert_eq!(token.balance(&contract_id), 0, "seed {seed} step {i}: escrow not drained");
            terminal = true;
        } else {
            assert_eq!(
                token.balance(&contract_id),
                amount,
                "seed {seed} step {i}: escrow balance drifted while non-terminal"
            );
        }
    }
}

#[test]
fn property_generated_sequences_preserve_invariants() {
    let action_pool = [Action::Release, Action::Cancel, Action::Expire];

    for seed in 0u64..32 {
        let mut rng = Lcg::new(seed ^ 0x9E3779B97F4A7C15);
        let amount = 1 + rng.below(1_000) as i128;
        let expiry_delta = 1 + rng.below(8) as u32;
        let len = 1 + rng.below(6) as usize;

        let mut actions = [Action::Release; 6];
        for slot in actions.iter_mut().take(len) {
            *slot = action_pool[rng.below(action_pool.len() as u64) as usize];
        }

        run_sequence(seed, amount, expiry_delta, &actions[..len]);
    }
}

#[test]
fn property_release_conserves_funds() {
    // Focused success case: release moves the full escrow to the beneficiary and
    // conserves the total held by both parties.
    run_sequence(1, 500, 10, &[Action::Release]);
}

#[test]
fn property_refund_conserves_funds() {
    // Focused refund case: cancel returns the full escrow to the depositor.
    run_sequence(2, 500, 10, &[Action::Cancel]);
}

#[test]
fn property_expiry_boundary_conserves_funds() {
    // Boundary case: expire fails before the expiry ledger and refunds after it.
    run_sequence(3, 500, 1, &[Action::Expire, Action::Expire]);
}

#[test]
fn property_unauthorized_transitions_are_rejected() {
    // Authorization case: without mocked auths, transitions must fail and leave
    // the escrow balance untouched.
    let env = Env::default();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);
    let token = token::Client::new(&env, &token_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    assert!(client.try_release().is_err());
    assert!(client.try_cancel().is_err());
    assert_eq!(token.balance(&contract_id), 100);
    assert_eq!(client.get().state, EscrowState::Created);
}

#[test]
fn property_failure_cases_leave_escrow_intact() {
    // Failure case: a transition that cannot succeed (expire before the expiry
    // ledger) must not move funds or change state.
    let env = Env::default();
    env.mock_all_auths();
    let (contract_id, depositor, beneficiary, token_id) = setup(&env);
    let client = EscrowContractClient::new(&env, &contract_id);
    let token = token::Client::new(&env, &token_id);

    token::StellarAssetClient::new(&env, &token_id).mint(&depositor, &100);
    client.create(&depositor, &beneficiary, &token_id, &100, &(env.ledger().sequence() + 10));

    assert_eq!(client.try_expire(), Err(Ok(EscrowError::NotExpired)));
    assert_eq!(token.balance(&contract_id), 100);
    assert_eq!(token.balance(&depositor), 0);
    assert_eq!(token.balance(&beneficiary), 0);
    assert_eq!(client.get().state, EscrowState::Created);
}
