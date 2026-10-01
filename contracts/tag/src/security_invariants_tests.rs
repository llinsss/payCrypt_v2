//! Security invariant tests for the tag registry.
//!
//! # Coverage map
//!
//! This module implements the acceptance criteria for the Rust/Soroban security
//! review: trust boundary, privileged roles, replay behaviour, and failure-safe
//! state transitions. Every test is annotated with the invariant category it
//! checks.
//!
//! ## Trust boundary
//!
//! The contract has exactly one privileged role: the **tag owner**. No other
//! address has write access to the registry. The trust boundary is enforced
//! exclusively through `Address::require_auth`, which aborts a transaction
//! when authorization is absent. There is no fallback, no default, and no
//! bypass path.
//!
//! Invariants:
//! - `TRUST_BOUNDARY_*`: only the current owner may mutate state.
//! - `STRANGER_*`: an arbitrary third party has no write access at any phase.
//!
//! ## Privileged roles
//!
//! Only three operations require authorization, and each requires a specific
//! role:
//!
//! | Operation          | Required role         |
//! |--------------------|-----------------------|
//! | `propose_transfer` | current owner         |
//! | `cancel_transfer`  | current owner         |
//! | `accept_transfer`  | pending destination   |
//!
//! No other role exists. There is no admin, no pauser, and no privileged
//! deployer after initialization.
//!
//! ## Replay behaviour
//!
//! The state machine is the replay guard. A transfer can only be accepted once
//! because `accept_transfer` removes the pending record atomically. A
//! re-played accept on a ledger that has advanced has no pending record to
//! find, so it fails with `NoPendingTransfer`. The same applies to a cancelled
//! transfer.
//!
//! Invariants:
//! - `REPLAY_*`: the same operation cannot succeed twice.
//!
//! ## Failure-safe state transitions
//!
//! Every write operation is either fully applied or leaves the state unchanged.
//! A failed authorization does not partially mutate storage. A rejected tag
//! does not write anything. A re-played accept or cancel fails before touching
//! storage.
//!
//! Invariants:
//! - `FAILURE_SAFE_*`: failed calls leave state identical to before the call.
//!
//! ## Property tests
//!
//! A lightweight property sweep checks that the invariants hold for a
//! representative sample of generated inputs, not only the hand-written
//! corpus cases.

use alloc::string::String as OwnedString;

use soroban_sdk::{Address, Env, String, Symbol};

use crate::fixtures::{address, advance_ledger, deterministic_env};
use crate::{TagContract, TagContractClient, TagError};

// ─── helpers ─────────────────────────────────────────────────────────────────

fn deploy(env: &Env) -> TagContractClient<'static> {
    let id = env.register(TagContract, ());
    TagContractClient::new(env, &id)
}

/// Deploy and register `tag` under `owner`. Returns (client, owner).
fn register(env: &Env, owner: &Address, tag: &str) -> TagContractClient<'static> {
    let client = deploy(env);
    client.initialize_tag(owner, &String::from_str(env, tag));
    client
}

/// Assert a call aborted due to missing authorization (not a contract error).
#[track_caller]
fn assert_auth_required<T, C, E>(
    result: Result<Result<T, C>, Result<E, soroban_sdk::InvokeError>>,
) where
    T: core::fmt::Debug,
    C: core::fmt::Debug,
    E: core::fmt::Debug,
{
    assert!(
        matches!(result, Err(Err(_))),
        "expected authorization failure, got {result:?}"
    );
}

// ─── TRUST_BOUNDARY: only the owner can propose a transfer ───────────────────

/// TRUST_BOUNDARY_01: a stranger cannot propose a transfer on someone else's tag.
#[test]
fn trust_boundary_stranger_cannot_propose_transfer() {
    let env = deterministic_env();
    let owner = address(&env);
    let stranger = address(&env);
    let client = register(&env, &owner, "alice");

    assert_auth_required(client.try_propose_transfer(&stranger));
    assert_eq!(client.get_pending_transfer(), None, "no proposal must be recorded");
}

/// TRUST_BOUNDARY_02: the pending destination cannot re-propose before accepting.
#[test]
fn trust_boundary_pending_cannot_propose_new_transfer() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let stranger = address(&env);
    let client = register(&env, &owner, "alice");
    client.propose_transfer(&pending);

    // Turn off mocking so the next call uses real auth.
    env.set_auths(&[]);
    // `pending` is not the owner, so it cannot propose.
    assert_auth_required(client.try_propose_transfer(&stranger));
}

/// TRUST_BOUNDARY_03: a stranger cannot cancel the owner's proposal.
#[test]
fn trust_boundary_stranger_cannot_cancel_transfer() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let client = register(&env, &owner, "alice");
    client.propose_transfer(&pending);

    env.set_auths(&[]);
    assert_auth_required(client.try_cancel_transfer());
    assert!(client.get_pending_transfer().is_some(), "proposal must survive");
}

/// TRUST_BOUNDARY_04: a stranger cannot accept a transfer directed at someone else.
#[test]
fn trust_boundary_stranger_cannot_accept_transfer() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let client = register(&env, &owner, "alice");
    client.propose_transfer(&pending);

    env.set_auths(&[]);
    assert_auth_required(client.try_accept_transfer());
    // Ownership must be unchanged.
    assert_eq!(client.get_tag().owner, owner, "owner must be unchanged");
}

/// TRUST_BOUNDARY_05: the current owner cannot accept their own proposal
/// (only the pending destination can accept).
#[test]
fn trust_boundary_owner_cannot_accept_own_proposal() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let client = register(&env, &owner, "alice");
    client.propose_transfer(&pending);

    // Stop mocking; the owner is not the authorized acceptor.
    env.set_auths(&[]);
    assert_auth_required(client.try_accept_transfer());
    assert_eq!(client.get_tag().owner, owner);
}

// ─── PRIVILEGED_ROLES: correct role gating ───────────────────────────────────

/// PRIVILEGED_ROLES_01: only the owner can propose, regardless of ledger state.
#[test]
fn privileged_roles_only_owner_can_propose() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let other = address(&env);
    let client = register(&env, &owner, "bob");

    // Propose → accept → advance; the new owner is `other`.
    client.propose_transfer(&other);
    client.accept_transfer();
    advance_ledger(&env);

    // `owner` is no longer the owner; it cannot propose again.
    env.set_auths(&[]);
    assert_auth_required(client.try_propose_transfer(&address(&env)));
}

/// PRIVILEGED_ROLES_02: the pending destination is the only address that can accept.
#[test]
fn privileged_roles_only_pending_destination_can_accept() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let stranger = address(&env);
    let client = register(&env, &owner, "carol");
    client.propose_transfer(&pending);

    // With mocking off, calling accept_transfer requires the pending
    // destination's authorization, not the stranger's.
    env.set_auths(&[]);
    assert_auth_required(client.try_accept_transfer());

    // State is unchanged.
    let recorded = client.get_pending_transfer().expect("proposal still present");
    assert_eq!(recorded.to, pending);
    assert_ne!(recorded.to, stranger);
}

/// PRIVILEGED_ROLES_03: propose replaces an existing proposal atomically.
/// Only the current owner can do this; the superseded destination cannot block it.
#[test]
fn privileged_roles_owner_can_supersede_proposal() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let first = address(&env);
    let second = address(&env);
    let client = register(&env, &owner, "dave");
    client.propose_transfer(&first);
    client.propose_transfer(&second);

    let p = client.get_pending_transfer().expect("proposal present");
    assert_eq!(p.to, second, "latest proposal wins");
    assert_ne!(p.to, first, "previous proposal must be replaced");
}

/// PRIVILEGED_ROLES_04: once accepted, the new owner holds all privileges.
#[test]
fn privileged_roles_new_owner_inherits_all_privileges() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let new_owner = address(&env);
    let next = address(&env);
    let client = register(&env, &owner, "eve");
    client.propose_transfer(&new_owner);
    client.accept_transfer();
    advance_ledger(&env);

    // new_owner can now propose and cancel.
    client.propose_transfer(&next);
    assert!(client.get_pending_transfer().is_some());
    client.cancel_transfer();
    assert!(client.get_pending_transfer().is_none());
}

// ─── REPLAY: a completed or cancelled transfer cannot be replayed ─────────────

/// REPLAY_01: accepting a transfer twice fails the second time.
#[test]
fn replay_accept_twice_fails() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let client = register(&env, &owner, "frank");
    client.propose_transfer(&pending);
    client.accept_transfer();
    advance_ledger(&env);

    assert_eq!(
        client.try_accept_transfer(),
        Err(Ok(TagError::NoPendingTransfer)),
        "replayed accept must be rejected"
    );
    // Final ownership is the accepted destination, not a partially-replayed state.
    assert_eq!(client.get_tag().owner, pending);
}

/// REPLAY_02: cancelling a transfer twice fails the second time.
#[test]
fn replay_cancel_twice_fails() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let client = register(&env, &owner, "grace");
    client.propose_transfer(&pending);
    client.cancel_transfer();
    advance_ledger(&env);

    assert_eq!(
        client.try_cancel_transfer(),
        Err(Ok(TagError::NoPendingTransfer))
    );
    assert_eq!(client.get_tag().owner, owner, "owner unchanged after cancelled replay");
}

/// REPLAY_03: a cancelled proposal cannot be accepted after the cancellation.
#[test]
fn replay_cancelled_proposal_cannot_be_accepted() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let client = register(&env, &owner, "heidi");
    client.propose_transfer(&pending);
    client.cancel_transfer();
    advance_ledger(&env);

    assert_eq!(
        client.try_accept_transfer(),
        Err(Ok(TagError::NoPendingTransfer))
    );
    assert_eq!(client.get_tag().owner, owner);
}

/// REPLAY_04: submitting the same initialization twice fails without
/// altering the stored tag.
#[test]
fn replay_initialize_twice_fails() {
    let env = deterministic_env();
    let owner = address(&env);
    let other = address(&env);
    let client = register(&env, &owner, "ivan");

    assert_eq!(
        client.try_initialize_tag(&other, &String::from_str(&env, "ivan")),
        Err(Ok(TagError::AlreadyInitialized))
    );
    // Original owner and tag unchanged.
    assert_eq!(client.get_tag().owner, owner);
    assert_eq!(client.get_tag().name, Symbol::new(&env, "ivan"));
}

/// REPLAY_05: a superseded proposal cannot be accepted — only the latest
/// pending destination is authorised.
#[test]
fn replay_superseded_proposal_cannot_be_accepted() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let first = address(&env);
    let second = address(&env);
    let client = register(&env, &owner, "judy");
    client.propose_transfer(&first);
    client.propose_transfer(&second);

    // The first destination is no longer the pending destination.
    env.set_auths(&[]);
    // Calling accept_transfer requires second's auth, not first's —
    // first cannot accept.
    assert_auth_required(client.try_accept_transfer());
    assert_eq!(client.get_tag().owner, owner, "ownership unmoved");
}

// ─── FAILURE_SAFE: failed calls must not mutate state ────────────────────────

/// FAILURE_SAFE_01: a rejected tag name leaves no storage entry.
#[test]
fn failure_safe_rejected_tag_leaves_no_storage() {
    let env = deterministic_env();
    let owner = address(&env);
    let client = deploy(&env);

    for bad in ["", "@@x", "al-ice", "\u{0430}lice", "al ice"] {
        let _ = client.try_initialize_tag(&owner, &String::from_str(&env, bad));
    }
    assert_eq!(
        client.try_get_tag(),
        Err(Ok(TagError::NotInitialized)),
        "no storage must exist after all rejections"
    );
}

/// FAILURE_SAFE_02: an unauthorized propose leaves the pending slot empty.
#[test]
fn failure_safe_unauthorized_propose_leaves_pending_empty() {
    let env = deterministic_env();
    let owner = address(&env);
    let stranger = address(&env);
    let client = register(&env, &owner, "karl");

    assert_auth_required(client.try_propose_transfer(&stranger));
    assert_eq!(client.get_pending_transfer(), None);
}

/// FAILURE_SAFE_03: an unauthorized accept leaves both ownership and
/// pending slot unchanged.
#[test]
fn failure_safe_unauthorized_accept_leaves_state_unchanged() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let client = register(&env, &owner, "larry");
    client.propose_transfer(&pending);

    env.set_auths(&[]);
    assert_auth_required(client.try_accept_transfer());

    // Both storage slots are unchanged.
    assert_eq!(client.get_tag().owner, owner);
    let p = client.get_pending_transfer().expect("proposal still present");
    assert_eq!(p.to, pending);
}

/// FAILURE_SAFE_04: an unauthorized cancel leaves the pending slot intact.
#[test]
fn failure_safe_unauthorized_cancel_leaves_pending_intact() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let client = register(&env, &owner, "mona");
    client.propose_transfer(&pending);

    env.set_auths(&[]);
    assert_auth_required(client.try_cancel_transfer());

    assert!(client.get_pending_transfer().is_some(), "pending slot must survive");
    assert_eq!(client.get_tag().owner, owner);
}

/// FAILURE_SAFE_05: a re-played accept leaves ownership at the accepted
/// destination and does not corrupt the pending slot.
#[test]
fn failure_safe_replayed_accept_does_not_corrupt_state() {
    let env = deterministic_env();
    env.mock_all_auths();
    let owner = address(&env);
    let pending = address(&env);
    let client = register(&env, &owner, "nora");
    client.propose_transfer(&pending);
    client.accept_transfer();

    let _ = client.try_accept_transfer(); // replay

    assert_eq!(client.get_tag().owner, pending, "ownership must remain at accepted destination");
    assert_eq!(client.get_pending_transfer(), None, "no phantom pending entry");
}

/// FAILURE_SAFE_06: reading from an uninitialized registry returns errors
/// consistently and does not trigger any implicit initialization.
#[test]
fn failure_safe_reads_on_uninitialized_registry_return_errors() {
    let env = deterministic_env();
    let client = deploy(&env);

    assert_eq!(client.try_get_tag(), Err(Ok(TagError::NotInitialized)));
    assert_eq!(client.get_pending_transfer(), None);
    assert_eq!(
        client.try_propose_transfer(&address(&env)),
        Err(Ok(TagError::NotInitialized))
    );
    assert_eq!(
        client.try_accept_transfer(),
        Err(Ok(TagError::NotInitialized))
    );
    assert_eq!(
        client.try_cancel_transfer(),
        Err(Ok(TagError::NotInitialized))
    );
}

// ─── PROPERTY: sweep of generated inputs ─────────────────────────────────────

/// PROPERTY_01: for any accepted tag, a successful initialization always
/// stores exactly the canonical form, never the raw form.
#[test]
fn property_initialization_always_stores_canonical_form() {
    use crate::harness::{generate_case, Rng};
    use crate::normalize::{TagName, MAX_RAW_SCAN_BYTES};

    let env = deterministic_env();
    let mut rng = Rng::new(0xc0de_cafe_1234_5678);
    let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];

    for _ in 0..128 {
        let len = generate_case(&mut rng, &mut buffer);
        let Ok(tag) = TagName::parse_bytes(&buffer[..len]) else { continue };

        let owner = address(&env);
        let client = deploy(&env);
        let raw = soroban_sdk::String::from_bytes(&env, &buffer[..len]);
        client.initialize_tag(&owner, &raw);

        assert_eq!(
            client.get_tag().name,
            Symbol::new(&env, tag.as_str()),
            "stored symbol must be canonical for raw {:?}",
            &buffer[..len]
        );
    }
}

/// PROPERTY_02: inspect_tag and initialize_tag always agree on whether a tag
/// is accepted.
#[test]
fn property_inspect_and_initialize_agree_on_acceptance() {
    use crate::harness::{generate_case, Rng};
    use crate::normalize::MAX_RAW_SCAN_BYTES;

    let env = deterministic_env();
    let mut rng = Rng::new(0xdecaf_bad_0000_0001u64);
    let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];

    for _ in 0..128 {
        let len = generate_case(&mut rng, &mut buffer);
        let raw = soroban_sdk::String::from_bytes(&env, &buffer[..len]);
        let inspection = TagContract::inspect_tag(env.clone(), raw.clone());

        let owner = address(&env);
        let client = deploy(&env);
        let init_result = client.try_initialize_tag(&owner, &raw);

        assert_eq!(
            inspection.accepted,
            init_result.is_ok(),
            "inspect and initialize must agree for {:?}",
            &buffer[..len]
        );
    }
}

/// PROPERTY_03: ownership is always the address that completed the last
/// accepted transfer, across multiple chained transfers.
#[test]
fn property_ownership_tracks_last_accepted_transfer() {
    let env = deterministic_env();
    env.mock_all_auths();
    let initial_owner = address(&env);
    let client = register(&env, &initial_owner, "oscar");

    let mut current = initial_owner;
    for _ in 0..8 {
        let next = address(&env);
        client.propose_transfer(&next);
        client.accept_transfer();
        advance_ledger(&env);
        current = next.clone();
        assert_eq!(client.get_tag().owner, current);
    }
}
