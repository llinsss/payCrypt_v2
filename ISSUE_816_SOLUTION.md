# #816 Add cancellation for unused delegated approvals

## Trust Boundary & Privileged Roles
- **Signers**: Authorized signers who can propose, approve, and now revoke their approvals on withdrawal proposals.
- **Proposer**: The signer who creates a proposal automatically receives an approval (delegated approval).
- **Threshold**: Minimum number of distinct approvals required for execution.

## Typed Rust Implementation (Soroban)

### New Error Code
```rust
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum WalletError {
    // ... existing errors ...
    ApprovalNotFound = 19,
}
```

### New Event
```rust
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalApprovalRevoked {
    #[topic]
    pub event_type: Symbol,
    #[topic]
    pub schema_version: u32,
    #[topic]
    pub proposal_id: u64,
    pub signer: Address,
    pub approval_count: u32,
}
```

### New Function: `revoke_approval`
```rust
/// Revoke a previously granted approval for a pending proposal.
///
/// The signer must be an authorized signer and must have previously approved
/// the proposal. The proposal must not be executed or expired.
/// This allows signers to withdraw their delegated approval before execution.
pub fn revoke_approval(env: Env, signer: Address, proposal_id: u64) {
    require_signer(&env, &signer);
    let mut proposal = get_proposal(&env, proposal_id);
    let execution_nonce: u64 = env.storage().instance().get(&DataKey::ExecutionNonce).unwrap_or(0);
    if proposal.nonce < execution_nonce {
        fail(&env, WalletError::StaleProposal);
    }
    if env.ledger().timestamp() >= proposal.expiry {
        fail(&env, WalletError::ProposalExpired);
    }
    if proposal.executed {
        fail(&env, WalletError::ProposalExecuted);
    }
    let approval_key = DataKey::Approval(proposal_id, signer.clone());
    if !env.storage().instance().get(&approval_key).unwrap_or(false) {
        fail(&env, WalletError::ApprovalNotFound);
    }
    env.storage().instance().remove(&approval_key);
    proposal.approval_count -= 1;
    env.storage().instance().set(&DataKey::Proposal(proposal_id), &proposal);
    WithdrawalApprovalRevoked {
        event_type: Symbol::new(&env, "wallet_appr_revoked"),
        schema_version: 1,
        proposal_id,
        signer,
        approval_count: proposal.approval_count,
    }
    .publish(&env);
}
```

## Replay Behavior & State Transitions
- **Replay Protection**: The approval is removed from storage before the event is emitted. Subsequent revoke attempts for the same signer/proposal will fail with `ApprovalNotFound`.
- **Failure-Safe Transitions**: 
  - If the proposal is executed, expired, or stale, revocation is rejected before any state change.
  - The approval count is decremented atomically with the approval removal.
  - The event is emitted after successful state modification.

## Testing Strategy
- **Success Paths**: 
  - Signer approves then revokes approval (approval_count decrements)
  - Proposer revokes their own automatic approval
  - Multiple signers can independently revoke their approvals
- **Boundary Tests**:
  - Revoke on non-existent approval returns `ApprovalNotFound`
  - Revoke after execution returns `ProposalExecuted`
  - Revoke after expiry returns `ProposalExpired`
  - Revoke on stale proposal (nonce < execution_nonce) returns `StaleProposal`
- **Unauthorized Paths**:
  - Non-signer cannot revoke (rejected by `require_signer`)
  - Signer can only revoke their own approval, not others'
- **Replay/Failure**:
  - Duplicate revoke attempts fail with `ApprovalNotFound`

## Operational Behavior
- **Migration**: No migration needed. The new `revoke_approval` function is additive. Existing proposals continue to work.
- **Indexing**: Indexers should track `wallet_appr_revoked` events to monitor approval revocations. The event includes `proposal_id`, `signer`, and updated `approval_count`.
- **Monitoring**: Alert on proposals where approval_count drops below threshold after revocation, as this may prevent execution.
- **Rollback**: Not applicable - revocation is a normal operational action. If a proposal becomes unexecutable due to revocations, signers can re-approve (if not expired) or a new proposal can be created.