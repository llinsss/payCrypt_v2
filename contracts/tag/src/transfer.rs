use soroban_sdk::{contracterror, contracttype, Address, Env};

/// Lifecycle state of a tag transfer proposal.
///
/// A proposal starts as `Active` and may only be accepted while it is still
/// `Active`. Once it has been canceled, superseded, or has expired it can no
/// longer be accepted.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum TransferStatus {
    Active = 0,
    Canceled = 1,
    Superseded = 2,
    Expired = 3,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum TransferError {
    /// The proposal does not exist.
    NotFound = 1,
    /// The proposal is no longer active (canceled, superseded, or expired).
    NotActive = 2,
    /// The caller is not authorized to perform this action.
    Unauthorized = 3,
    /// The proposal has passed its expiry ledger.
    Expired = 4,
}

/// A pending transfer of a tag from `from` to `to`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferProposal {
    pub from: Address,
    pub to: Address,
    pub status: TransferStatus,
    /// Ledger sequence after which the proposal can no longer be accepted.
    pub expires_at: u32,
}

/// Storage key for a tag's transfer proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum TransferKey {
    Proposal(u32),
}

fn load(env: &Env, tag_id: u32) -> Result<TransferProposal, TransferError> {
    env.storage()
        .persistent()
        .get(&TransferKey::Proposal(tag_id))
        .ok_or(TransferError::NotFound)
}

fn save(env: &Env, tag_id: u32, proposal: &TransferProposal) {
    env.storage()
        .persistent()
        .set(&TransferKey::Proposal(tag_id), proposal);
}

/// Resolve the effective status of a proposal, accounting for expiry.
fn effective_status(env: &Env, proposal: &TransferProposal) -> TransferStatus {
    if proposal.status == TransferStatus::Active && env.ledger().sequence() > proposal.expires_at {
        TransferStatus::Expired
    } else {
        proposal.status
    }
}

/// Create a new transfer proposal for `tag_id`.
///
/// Any existing active proposal for the same tag is marked `Superseded` so it
/// can no longer be accepted. The proposer must authorize the call.
///
/// Returns the newly created proposal.
pub fn propose(
    env: &Env,
    tag_id: u32,
    from: Address,
    to: Address,
    expires_at: u32,
) -> Result<TransferProposal, TransferError> {
    from.require_auth();

    if let Some(existing) = env
        .storage()
        .persistent()
        .get::<TransferKey, TransferProposal>(&TransferKey::Proposal(tag_id))
    {
        if effective_status(env, &existing) == TransferStatus::Active {
            let mut superseded = existing;
            superseded.status = TransferStatus::Superseded;
            save(env, tag_id, &superseded);
        }
    }

    let proposal = TransferProposal {
        from,
        to,
        status: TransferStatus::Active,
        expires_at,
    };
    save(env, tag_id, &proposal);
    Ok(proposal)
}

/// Cancel an active transfer proposal.
///
/// Only the original proposer (`from`) may cancel. Canceled proposals can no
/// longer be accepted.
pub fn cancel(env: &Env, tag_id: u32, caller: Address) -> Result<(), TransferError> {
    caller.require_auth();

    let mut proposal = load(env, tag_id)?;
    if proposal.from != caller {
        return Err(TransferError::Unauthorized);
    }
    if effective_status(env, &proposal) != TransferStatus::Active {
        return Err(TransferError::NotActive);
    }

    proposal.status = TransferStatus::Canceled;
    save(env, tag_id, &proposal);
    Ok(())
}

/// Accept an active transfer proposal.
///
/// Fails with `NotActive` if the proposal was canceled or superseded, and with
/// `Expired` if it has passed its expiry ledger. Only the designated recipient
/// (`to`) may accept.
pub fn accept(env: &Env, tag_id: u32, caller: Address) -> Result<TransferProposal, TransferError> {
    caller.require_auth();

    let mut proposal = load(env, tag_id)?;
    if proposal.to != caller {
        return Err(TransferError::Unauthorized);
    }

    match effective_status(env, &proposal) {
        TransferStatus::Active => {}
        TransferStatus::Expired => return Err(TransferError::Expired),
        TransferStatus::Canceled | TransferStatus::Superseded => {
            return Err(TransferError::NotActive)
        }
    }

    proposal.status = TransferStatus::Superseded;
    save(env, tag_id, &proposal);
    Ok(proposal)
}

/// Read the current proposal for a tag, if any.
pub fn get(env: &Env, tag_id: u32) -> Result<TransferProposal, TransferError> {
    load(env, tag_id)
}
