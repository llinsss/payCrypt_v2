#![no_std]

use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token, Address, Env, Map, Symbol, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum WalletError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidThreshold = 3,
    DuplicateSigner = 4,
    UnknownSigner = 5,
    LastSigner = 6,
    UnsupportedToken = 7,
    InvalidWithdrawal = 8,
    DestinationNotAllowed = 9,
    UnknownProposal = 10,
    DuplicateApproval = 11,
    InsufficientApprovals = 12,
    StaleProposal = 13,
    ProposalExecuted = 14,
    Unauthorized = 15,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Signers,
    Threshold,
    NextNonce,
    ExecutionNonce,
    Proposal(u64),
    Approval(u64, Address),
    SupportedToken(Address),
    MaxWithdrawal,
    RestrictedDestinations,
    AllowedDestination(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalProposal {
    pub id: u64,
    pub nonce: u64,
    pub proposer: Address,
    pub token: Address,
    pub destination: Address,
    pub amount: i128,
    pub approval_count: u32,
    pub executed: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalProposed {
    #[topic]
    pub event_type: Symbol,
    #[topic]
    pub schema_version: u32,
    #[topic]
    pub proposal_id: u64,
    pub nonce: u64,
    pub proposer: Address,
    pub token: Address,
    pub destination: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalApproved {
    #[topic]
    pub event_type: Symbol,
    #[topic]
    pub schema_version: u32,
    #[topic]
    pub proposal_id: u64,
    pub signer: Address,
    pub approval_count: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalExecuted {
    #[topic]
    pub event_type: Symbol,
    #[topic]
    pub schema_version: u32,
    #[topic]
    pub proposal_id: u64,
    pub nonce: u64,
    pub destination: Address,
    pub token: Address,
    pub amount: i128,
}

#[contract]
pub struct WalletContract;

#[contractimpl]
impl WalletContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        signers: Vec<Address>,
        threshold: u32,
        max_withdrawal: i128,
        restrict_destinations: bool,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            fail(&env, WalletError::AlreadyInitialized);
        }
        admin.require_auth();
        validate_threshold(&env, signers.len(), threshold);
        if max_withdrawal <= 0 {
            fail(&env, WalletError::InvalidWithdrawal);
        }
        let mut unique = Map::<Address, bool>::new(&env);
        for signer in signers.iter() {
            if unique.contains_key(signer.clone()) {
                fail(&env, WalletError::DuplicateSigner);
            }
            unique.set(signer, true);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Signers, &unique);
        env.storage().instance().set(&DataKey::Threshold, &threshold);
        env.storage().instance().set(&DataKey::NextNonce, &0_u64);
        env.storage().instance().set(&DataKey::ExecutionNonce, &0_u64);
        env.storage().instance().set(&DataKey::MaxWithdrawal, &max_withdrawal);
        env.storage().instance().set(&DataKey::RestrictedDestinations, &restrict_destinations);
    }

    pub fn add_signer(env: Env, caller: Address, signer: Address) {
        require_admin(&env, &caller);
        let mut signers = get_signers(&env);
        if signers.contains_key(signer.clone()) {
            fail(&env, WalletError::DuplicateSigner);
        }
        signers.set(signer, true);
        env.storage().instance().set(&DataKey::Signers, &signers);
    }

    pub fn remove_signer(env: Env, caller: Address, signer: Address) {
        require_admin(&env, &caller);
        let mut signers = get_signers(&env);
        if !signers.contains_key(signer.clone()) {
            fail(&env, WalletError::UnknownSigner);
        }
        if signers.len() <= 1 {
            fail(&env, WalletError::LastSigner);
        }
        let threshold: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap();
        if threshold > signers.len() - 1 {
            fail(&env, WalletError::InvalidThreshold);
        }
        signers.remove(signer);
        env.storage().instance().set(&DataKey::Signers, &signers);
    }

    pub fn set_threshold(env: Env, caller: Address, threshold: u32) {
        require_admin(&env, &caller);
        validate_threshold(&env, get_signers(&env).len(), threshold);
        env.storage().instance().set(&DataKey::Threshold, &threshold);
    }

    pub fn set_token_supported(env: Env, caller: Address, token: Address, supported: bool) {
        require_admin(&env, &caller);
        env.storage().instance().set(&DataKey::SupportedToken(token), &supported);
    }

    pub fn set_withdrawal_policy(
        env: Env,
        caller: Address,
        max_withdrawal: i128,
        restrict_destinations: bool,
    ) {
        require_admin(&env, &caller);
        if max_withdrawal <= 0 {
            fail(&env, WalletError::InvalidWithdrawal);
        }
        env.storage().instance().set(&DataKey::MaxWithdrawal, &max_withdrawal);
        env.storage().instance().set(&DataKey::RestrictedDestinations, &restrict_destinations);
    }

    pub fn set_destination_allowed(env: Env, caller: Address, destination: Address, allowed: bool) {
        require_admin(&env, &caller);
        env.storage().instance().set(&DataKey::AllowedDestination(destination), &allowed);
    }

    pub fn propose_withdrawal(
        env: Env,
        proposer: Address,
        token_address: Address,
        destination: Address,
        amount: i128,
    ) -> u64 {
        require_signer(&env, &proposer);
        if !env.storage().instance().get(&DataKey::SupportedToken(token_address.clone())).unwrap_or(false) {
            fail(&env, WalletError::UnsupportedToken);
        }
        let max_withdrawal: i128 = env.storage().instance().get(&DataKey::MaxWithdrawal).unwrap();
        if amount <= 0 || amount > max_withdrawal {
            fail(&env, WalletError::InvalidWithdrawal);
        }
        let restricted: bool = env.storage().instance().get(&DataKey::RestrictedDestinations).unwrap_or(false);
        if restricted && !env.storage().instance().get(&DataKey::AllowedDestination(destination.clone())).unwrap_or(false) {
            fail(&env, WalletError::DestinationNotAllowed);
        }
        let id: u64 = env.storage().instance().get(&DataKey::NextNonce).unwrap_or(0);
        let proposal = WithdrawalProposal {
            id,
            nonce: id,
            proposer: proposer.clone(),
            token: token_address,
            destination,
            amount,
            approval_count: 1,
            executed: false,
        };
        env.storage().instance().set(&DataKey::Proposal(id), &proposal);
        env.storage().instance().set(&DataKey::Approval(id, proposer), &true);
        env.storage().instance().set(&DataKey::NextNonce, &(id + 1));
        WithdrawalProposed {
            event_type: Symbol::new(&env, "wallet_withdrawal_proposed"),
            schema_version: 1,
            proposal_id: id,
            nonce: proposal.nonce,
            proposer: proposal.proposer,
            token: proposal.token,
            destination: proposal.destination,
            amount: proposal.amount,
        }
        .publish(&env);
        id
    }

    pub fn approve(env: Env, signer: Address, proposal_id: u64) {
        require_signer(&env, &signer);
        let mut proposal = get_proposal(&env, proposal_id);
        let execution_nonce: u64 = env.storage().instance().get(&DataKey::ExecutionNonce).unwrap_or(0);
        if proposal.nonce < execution_nonce {
            fail(&env, WalletError::StaleProposal);
        }
        if proposal.executed {
            fail(&env, WalletError::ProposalExecuted);
        }
        let approval_key = DataKey::Approval(proposal_id, signer);
        if env.storage().instance().get(&approval_key).unwrap_or(false) {
            fail(&env, WalletError::DuplicateApproval);
        }
        env.storage().instance().set(&approval_key, &true);
        proposal.approval_count += 1;
        env.storage().instance().set(&DataKey::Proposal(proposal_id), &proposal);
        WithdrawalApproved {
            event_type: Symbol::new(&env, "wallet_withdrawal_approved"),
            schema_version: 1,
            proposal_id,
            signer,
            approval_count: proposal.approval_count,
        }
        .publish(&env);
    }

    pub fn execute(env: Env, caller: Address, proposal_id: u64) {
        require_signer(&env, &caller);
        let mut proposal = get_proposal(&env, proposal_id);
        let execution_nonce: u64 = env.storage().instance().get(&DataKey::ExecutionNonce).unwrap_or(0);
        if proposal.nonce != execution_nonce {
            fail(&env, WalletError::StaleProposal);
        }
        if proposal.executed {
            fail(&env, WalletError::ProposalExecuted);
        }
        let threshold: u32 = env.storage().instance().get(&DataKey::Threshold).unwrap();
        if proposal.approval_count < threshold {
            fail(&env, WalletError::InsufficientApprovals);
        }
        token::Client::new(&env, &proposal.token).transfer(
            &env.current_contract_address(),
            &proposal.destination,
            &proposal.amount,
        );
        proposal.executed = true;
        env.storage().instance().set(&DataKey::Proposal(proposal_id), &proposal);
        env.storage().instance().set(&DataKey::ExecutionNonce, &(execution_nonce + 1));
        WithdrawalExecuted {
            event_type: Symbol::new(&env, "wallet_withdrawal_executed"),
            schema_version: 1,
            proposal_id: proposal.id,
            nonce: proposal.nonce,
            destination: proposal.destination,
            token: proposal.token,
            amount: proposal.amount,
        }
        .publish(&env);
    }

    pub fn is_signer(env: Env, signer: Address) -> bool {
        get_signers(&env).contains_key(signer)
    }

    pub fn threshold(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Threshold).unwrap_or(0)
    }

    pub fn proposal(env: Env, proposal_id: u64) -> WithdrawalProposal {
        get_proposal(&env, proposal_id)
    }

    pub fn execution_nonce(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::ExecutionNonce).unwrap_or(0)
    }
}

fn get_signers(env: &Env) -> Map<Address, bool> {
    env.storage().instance().get(&DataKey::Signers).unwrap_or(Map::new(env))
}

fn get_proposal(env: &Env, proposal_id: u64) -> WithdrawalProposal {
    env.storage().instance().get(&DataKey::Proposal(proposal_id)).unwrap_or_else(|| fail(env, WalletError::UnknownProposal))
}

fn validate_threshold(env: &Env, signer_count: u32, threshold: u32) {
    if threshold == 0 || threshold > signer_count {
        fail(env, WalletError::InvalidThreshold);
    }
}

fn require_admin(env: &Env, caller: &Address) {
    caller.require_auth();
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap_or_else(|| fail(env, WalletError::NotInitialized));
    if *caller != admin {
        fail(env, WalletError::Unauthorized);
    }
}

fn require_signer(env: &Env, signer: &Address) {
    signer.require_auth();
    if !get_signers(env).contains_key(signer.clone()) {
        fail(env, WalletError::UnknownSigner);
    }
}

fn fail<T>(env: &Env, error: WalletError) -> T {
    panic_with_error!(env, error)
}

#[cfg(test)]
mod test;