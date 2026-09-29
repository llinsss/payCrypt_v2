//! Contract-level tests for the tag registry.
//!
//! These exercise what the fuzz harness cannot reach on its own:
//! authorization, the ownership-transfer state machine, replay, and the
//! interaction between normalization and storage.
//!
//! # Authorization model
//!
//! The registry does not take an `actor` argument; it calls
//! `Address::require_auth`, which **aborts** the transaction when the required
//! authorization is absent. A rejected call therefore surfaces as the outer
//! `Err` of a `try_` invocation, never as a `TagError`.
//! [`assert_authorization_required`] asserts exactly that, which is what
//! separates "not authorized" from "rejected by validation".
//!
//! `Env::set_auths` disables `mock_all_auths`, so a fixture can record the
//! happy path with mocking on and then prove that a call without the right
//! authorization aborts.
//!
//! Every test uses [`crate::fixtures`], so the ledger sequence, the ledger
//! timestamp, and the address sequence are identical on every run.

use alloc::borrow::ToOwned;
use alloc::format;
use alloc::string::String as OwnedString;

use soroban_sdk::testutils::Events as _;
use soroban_sdk::{Address, Env, InvokeError, String, Symbol, TryFromVal};

use crate::fixtures::{address, advance_ledger, deterministic_env};
use crate::harness;
use crate::normalize::{TagName, TagNameError, MAX_RAW_SCAN_BYTES, MAX_TAG_BYTES};
use crate::{TagContract, TagContractClient, TagError, TagInspection};

/// A deployed registry plus the three parties used by the transfer tests.
struct Fixture {
    env: Env,
    client: TagContractClient<'static>,
    owner: Address,
    pending: Address,
    stranger: Address,
}

impl Fixture {
    /// Deploy and register `raw`, which must be an acceptable tag.
    ///
    /// `raw` is stored through `initialize_tag`, so the stored symbol is the
    /// canonical form; `expected` is what that canonical form should be.
    fn register(raw: &str, expected: &str) -> Self {
        let env = deterministic_env();
        let owner = address(&env);
        let pending = address(&env);
        let stranger = address(&env);
        let client = deploy(&env);
        client.initialize_tag(&owner, &String::from_str(&env, raw));
        assert_eq!(
            client.get_tag().name,
            Symbol::new(&env, expected),
            "fixture must store the canonical tag for {raw:?}"
        );
        assert_eq!(client.get_tag().owner, owner);
        Self {
            env,
            client,
            owner,
            pending,
            stranger,
        }
    }

    /// A fixture with every authorization mocked, for happy paths.
    fn authorized(raw: &str) -> Self {
        let fixture = Self::register(raw, raw);
        fixture.env.mock_all_auths();
        fixture
    }

    /// Turn authorization mocking off again, so subsequent calls must supply
    /// their own authorizations.
    fn stop_mocking_auths(&self) {
        self.env.set_auths(&[]);
    }
}

/// Assert a call was rejected by the host because the required authorization
/// was missing, rather than returning a contract error.
///
/// A generated `try_` method has the shape
/// `Result<Result<T, ConversionError>, Result<E, InvokeError>>`; the
/// authorization failure is the `Err(Err(_))` case.
#[track_caller]
fn assert_authorization_required<T, C, E>(result: Result<Result<T, C>, Result<E, InvokeError>>)
where
    T: core::fmt::Debug,
    C: core::fmt::Debug,
    E: core::fmt::Debug,
{
    assert!(
        matches!(result, Err(Err(_))),
        "expected an authorization failure, got {result:?}"
    );
}

fn deploy(env: &Env) -> TagContractClient<'static> {
    let contract_id = env.register(TagContract, ());
    TagContractClient::new(env, &contract_id)
}

/// Normalize `raw` through the contract's read-only view.
fn inspect(env: &Env, raw: &str) -> TagInspection {
    TagContract::inspect_tag(env.clone(), String::from_str(env, raw))
}

/// Canonical byte length of `raw` through the contract's read-only view.
fn byte_len(env: &Env, raw: &str) -> u32 {
    TagContract::tag_byte_len(env.clone(), String::from_str(env, raw))
}

// ─── Success paths ───────────────────────────────────────────────────────────

#[test]
fn initialize_tag_stores_the_canonical_symbol() {
    for (raw, expected) in [
        ("alice", "alice"),
        ("Alice", "alice"),
        ("@Alice", "alice"),
        ("  @ALICE\t", "alice"),
        ("a", "a"),
        ("a_l_i_c_e_9", "a_l_i_c_e_9"),
    ] {
        let fixture = Fixture::register(raw, expected);
        assert_eq!(
            fixture.client.get_tag().name,
            Symbol::new(&fixture.env, expected)
        );
    }
}

#[test]
fn every_spelling_of_one_tag_resolves_to_one_stored_value() {
    let env = deterministic_env();
    let expected = inspect(&env, "@Ada");
    for raw in ["ada", "Ada", "ADA", "aDa", "@ada", "  ada  ", "\t@ADA\n"] {
        assert_eq!(
            inspect(&env, raw),
            expected,
            "raw {raw:?} must normalize identically"
        );
    }
}

#[test]
fn inspect_tag_reports_the_canonical_form_and_length() {
    let env = deterministic_env();
    let inspection = inspect(&env, "  @AlIcE  ");
    assert!(inspection.accepted);
    assert_eq!(inspection.code, 0);
    assert_eq!(inspection.byte_len, 5);
    assert_eq!(inspection.canonical, Symbol::new(&env, "alice"));
}

#[test]
fn inspect_tag_never_fails_so_rejections_stay_observable() {
    let env = deterministic_env();
    let rejected = inspect(&env, "@@bad");
    assert!(!rejected.accepted);
    assert_eq!(rejected.byte_len, 0);
    assert_eq!(rejected.canonical, Symbol::new(&env, ""));
    assert_eq!(rejected.code, TagNameError::DISALLOWED_BYTE);
}

#[test]
fn every_rejection_code_is_reachable_through_the_contract() {
    let env = deterministic_env();
    let cases: [(OwnedString, u32); 5] = [
        ("   ".to_owned(), TagNameError::EMPTY),
        (
            "a".repeat(MAX_RAW_SCAN_BYTES + 1),
            TagNameError::INPUT_TOO_LONG,
        ),
        ("al\u{e9}ce".to_owned(), TagNameError::NON_ASCII),
        ("al-ice".to_owned(), TagNameError::DISALLOWED_BYTE),
        ("z".repeat(MAX_TAG_BYTES + 1), TagNameError::TOO_LONG),
    ];
    for (raw, code) in cases {
        let inspection = inspect(&env, &raw);
        assert!(!inspection.accepted, "raw {raw:?}");
        assert_eq!(inspection.code, code, "raw {raw:?}");
    }
}

#[test]
fn inspect_tag_is_deterministic_across_ledgers() {
    let first = deterministic_env();
    let second = deterministic_env();
    advance_ledger(&first);
    for raw in [
        "alice".to_owned(),
        "@Alice".to_owned(),
        OwnedString::new(),
        "@@x".to_owned(),
        "z".repeat(MAX_TAG_BYTES + 1),
    ] {
        let left = inspect(&first, &raw);
        let right = inspect(&second, &raw);
        assert_eq!(left, right, "raw {raw:?} must not depend on ledger state");
    }
}

#[test]
fn tag_byte_len_matches_the_inspection() {
    let env = deterministic_env();
    for raw in [
        "a".to_owned(),
        "alice".to_owned(),
        "z".repeat(MAX_TAG_BYTES),
        OwnedString::new(),
        "@@x".to_owned(),
    ] {
        assert_eq!(
            byte_len(&env, &raw),
            inspect(&env, &raw).byte_len,
            "raw {raw:?}"
        );
    }
}

#[test]
fn the_symbol_entry_point_still_stores_an_explicit_symbol() {
    let env = deterministic_env();
    let owner = address(&env);
    let client = deploy(&env);
    client.initialize(&owner, &Symbol::new(&env, "legacy"));
    assert_eq!(client.get_tag().name, Symbol::new(&env, "legacy"));
}

// ─── Boundary paths ──────────────────────────────────────────────────────────

#[test]
fn the_lower_byte_bound_is_one() {
    let fixture = Fixture::register("a", "a");
    assert_eq!(
        fixture.client.get_tag().name,
        Symbol::new(&fixture.env, "a")
    );
}

#[test]
fn the_upper_byte_bound_is_thirty_two_bytes() {
    assert_eq!(MAX_TAG_BYTES, 32, "must track the Soroban Symbol limit");
    let at_limit = "z".repeat(MAX_TAG_BYTES);
    let fixture = Fixture::register(&at_limit, &at_limit);
    assert_eq!(
        fixture.client.get_tag().name,
        Symbol::new(&fixture.env, &at_limit)
    );
}

#[test]
fn one_byte_past_the_upper_bound_is_rejected() {
    let env = deterministic_env();
    let owner = address(&env);
    let client = deploy(&env);
    let over_limit = String::from_str(&env, &"z".repeat(MAX_TAG_BYTES + 1));
    assert_eq!(
        client.try_initialize_tag(&owner, &over_limit),
        Err(Ok(TagError::InvalidTagName))
    );
    assert_eq!(client.try_get_tag(), Err(Ok(TagError::NotInitialized)));
}

#[test]
fn the_raw_scan_bound_is_enforced_before_any_storage_write() {
    let env = deterministic_env();
    let owner = address(&env);
    let client = deploy(&env);

    // 64 valid bytes is 33 bytes past the tag limit, so it is rejected — but
    // by the tag limit, not the scan limit.
    let within = String::from_bytes(&env, &[b'a'; MAX_RAW_SCAN_BYTES]);
    assert_eq!(
        client.try_initialize_tag(&owner, &within),
        Err(Ok(TagError::InvalidTagName))
    );
    assert_eq!(
        TagContract::inspect_tag(env.clone(), within.clone()).code,
        TagNameError::TOO_LONG
    );

    // 65 bytes trips the scan guard before normalization runs.
    let over = String::from_bytes(&env, &[b'a'; MAX_RAW_SCAN_BYTES + 1]);
    assert_eq!(
        client.try_initialize_tag(&owner, &over),
        Err(Ok(TagError::InvalidTagName))
    );
    assert_eq!(
        TagContract::inspect_tag(env.clone(), over).code,
        TagNameError::INPUT_TOO_LONG
    );
    assert_eq!(client.try_get_tag(), Err(Ok(TagError::NotInitialized)));
}

#[test]
fn the_raw_scan_bound_trims_before_measuring_the_tag() {
    let env = deterministic_env();
    let owner = address(&env);
    let client = deploy(&env);
    let padded = format!("  {}  ", "z".repeat(MAX_TAG_BYTES));
    assert_eq!(padded.len(), MAX_TAG_BYTES + 4);
    client.initialize_tag(&owner, &String::from_str(&env, &padded));
    assert_eq!(
        client.get_tag().name,
        Symbol::new(&env, &"z".repeat(MAX_TAG_BYTES))
    );
}

// ─── Failure paths ───────────────────────────────────────────────────────────

#[test]
fn rejected_tags_never_write_state() {
    let env = deterministic_env();
    let owner = address(&env);
    let client = deploy(&env);

    for raw in [
        "",
        "   ",
        "@",
        "@@alice",
        "al-ice",
        "al ice",
        "\u{0430}lice",
        "@Ada@Bob",
        "alice\u{200d}",
    ] {
        let raw = String::from_str(&env, raw);
        assert_eq!(
            client.try_initialize_tag(&owner, &raw),
            Err(Ok(TagError::InvalidTagName)),
            "raw {raw:?} must be rejected"
        );
    }
    assert_eq!(client.try_get_tag(), Err(Ok(TagError::NotInitialized)));
}

#[test]
fn a_rejected_initialization_can_be_followed_by_a_valid_one() {
    let env = deterministic_env();
    let owner = address(&env);
    let client = deploy(&env);
    let bad = String::from_str(&env, "@@alice");
    assert_eq!(
        client.try_initialize_tag(&owner, &bad),
        Err(Ok(TagError::InvalidTagName))
    );
    let good = String::from_str(&env, "  @Alice ");
    client.initialize_tag(&owner, &good);
    assert_eq!(client.get_tag().name, Symbol::new(&env, "alice"));
}

#[test]
fn a_second_initialization_is_rejected_regardless_of_spelling() {
    let fixture = Fixture::register("alice", "alice");
    let other = String::from_str(&fixture.env, "@bob");
    assert_eq!(
        fixture.client.try_initialize_tag(&fixture.stranger, &other),
        Err(Ok(TagError::AlreadyInitialized))
    );
}

#[test]
fn reading_before_initialization_reports_not_initialized() {
    let env = deterministic_env();
    let client = deploy(&env);
    assert_eq!(client.try_get_tag(), Err(Ok(TagError::NotInitialized)));
    assert_eq!(
        client.try_propose_transfer(&address(&env)),
        Err(Ok(TagError::NotInitialized))
    );
    assert_eq!(
        client.try_cancel_transfer(),
        Err(Ok(TagError::NotInitialized))
    );
    // `accept_transfer` reads the tag before the pending transfer, so an
    // uninitialized registry reports `NotInitialized` rather than the absence
    // of a proposal.
    assert_eq!(
        client.try_accept_transfer(),
        Err(Ok(TagError::NotInitialized))
    );
    assert_eq!(client.get_pending_transfer(), None);
}

// ─── Authorization ───────────────────────────────────────────────────────────

#[test]
fn proposing_requires_the_owners_authorization() {
    let fixture = Fixture::register("alice", "alice");
    assert_authorization_required(fixture.client.try_propose_transfer(&fixture.pending));
    assert_eq!(fixture.client.get_pending_transfer(), None);
    assert_eq!(fixture.client.get_tag().owner, fixture.owner);
}

#[test]
fn cancelling_requires_the_owners_authorization() {
    let fixture = Fixture::authorized("alice");
    fixture.client.propose_transfer(&fixture.pending);
    fixture.stop_mocking_auths();
    assert_authorization_required(fixture.client.try_cancel_transfer());
    assert!(fixture.client.get_pending_transfer().is_some());
}

#[test]
fn accepting_requires_the_destinations_authorization() {
    let fixture = Fixture::authorized("alice");
    fixture.client.propose_transfer(&fixture.pending);
    fixture.stop_mocking_auths();
    assert_authorization_required(fixture.client.try_accept_transfer());
    assert_eq!(
        fixture.client.get_tag().owner,
        fixture.owner,
        "an unauthorized accept must not move ownership"
    );
    assert!(fixture.client.get_pending_transfer().is_some());
}

#[test]
fn a_transfer_only_moves_ownership_on_acceptance() {
    let fixture = Fixture::authorized("alice");
    fixture.client.propose_transfer(&fixture.pending);

    let pending = fixture
        .client
        .get_pending_transfer()
        .expect("proposal recorded");
    assert_eq!(pending.from, fixture.owner);
    assert_eq!(pending.to, fixture.pending);
    assert_eq!(
        fixture.client.get_tag().owner,
        fixture.owner,
        "proposal alone must not move ownership"
    );

    fixture.client.accept_transfer();
    assert_eq!(fixture.client.get_tag().owner, fixture.pending);
    assert_eq!(fixture.client.get_pending_transfer(), None);
}

// ─── Replay ──────────────────────────────────────────────────────────────────

#[test]
fn accepting_the_same_transfer_twice_fails_and_keeps_the_new_owner() {
    let fixture = Fixture::authorized("alice");
    fixture.client.propose_transfer(&fixture.pending);
    fixture.client.accept_transfer();
    assert_eq!(fixture.client.get_tag().owner, fixture.pending);

    advance_ledger(&fixture.env);
    assert_eq!(
        fixture.client.try_accept_transfer(),
        Err(Ok(TagError::NoPendingTransfer))
    );
    assert_eq!(fixture.client.get_tag().owner, fixture.pending);
}

#[test]
fn cancelling_the_same_transfer_twice_fails() {
    let fixture = Fixture::authorized("alice");
    fixture.client.propose_transfer(&fixture.pending);
    fixture.client.cancel_transfer();
    assert_eq!(fixture.client.get_pending_transfer(), None);

    advance_ledger(&fixture.env);
    assert_eq!(
        fixture.client.try_cancel_transfer(),
        Err(Ok(TagError::NoPendingTransfer))
    );
}

#[test]
fn a_superseded_proposal_leaves_only_the_latest_destination() {
    let fixture = Fixture::authorized("alice");
    fixture.client.propose_transfer(&fixture.stranger);
    fixture.client.propose_transfer(&fixture.pending);

    let pending = fixture
        .client
        .get_pending_transfer()
        .expect("proposal recorded");
    assert_eq!(pending.from, fixture.owner);
    assert_eq!(
        pending.to, fixture.pending,
        "the latest proposal must replace the earlier one"
    );

    // The superseded destination can no longer accept: with mocking off, the
    // only address whose authorization the contract requires is the current
    // pending destination.
    fixture.stop_mocking_auths();
    assert_authorization_required(fixture.client.try_accept_transfer());
    assert_eq!(fixture.client.get_tag().owner, fixture.owner);
}

#[test]
fn the_new_owner_can_propose_a_further_transfer() {
    let fixture = Fixture::authorized("alice");
    fixture.client.propose_transfer(&fixture.pending);
    fixture.client.accept_transfer();
    advance_ledger(&fixture.env);

    fixture.client.propose_transfer(&fixture.stranger);
    let pending = fixture
        .client
        .get_pending_transfer()
        .expect("proposal recorded");
    assert_eq!(pending.from, fixture.pending);
    assert_eq!(pending.to, fixture.stranger);

    fixture.client.accept_transfer();
    assert_eq!(fixture.client.get_tag().owner, fixture.stranger);
}

#[test]
fn a_cancelled_transfer_cannot_be_accepted_later() {
    let fixture = Fixture::authorized("alice");
    fixture.client.propose_transfer(&fixture.pending);
    fixture.client.cancel_transfer();
    advance_ledger(&fixture.env);
    assert_eq!(
        fixture.client.try_accept_transfer(),
        Err(Ok(TagError::NoPendingTransfer))
    );
    assert_eq!(fixture.client.get_tag().owner, fixture.owner);
}

// ─── Events ──────────────────────────────────────────────────────────────────

/// Assert that the most recent invocation published exactly one event, named
/// `name`, carrying `(owner, pending)` as its data.
///
/// `Env::events().all` reports the events of the *last* top-level invocation,
/// because the host starts a fresh event buffer for each one, so the schema is
/// asserted per call rather than accumulated across a sequence of calls.
#[track_caller]
fn assert_published_transfer_event(fixture: &Fixture, name: &str) {
    let env = &fixture.env;
    let events = env.events().all();
    assert_eq!(events.len(), 1, "expected one {name} event, got {events:?}");

    let (contract, topics, data) = events.get(0).unwrap();
    assert_eq!(
        contract, fixture.client.address,
        "{name} must be emitted by the registry"
    );
    assert_eq!(topics.len(), 1, "{name} must keep its single topic");
    let topic = Symbol::try_from_val(env, &topics.get(0).unwrap()).unwrap();
    assert_eq!(topic, Symbol::new(env, name));

    let pair = <(Address, Address)>::try_from_val(env, &data).unwrap();
    assert_eq!(
        pair,
        (fixture.owner.clone(), fixture.pending.clone()),
        "{name} data must be the (from, to) pair"
    );
}

/// Assert that the most recent invocation published no events.
#[track_caller]
fn assert_no_events(env: &Env, context: &str) {
    let events = env.events().all();
    assert!(
        events.is_empty(),
        "{context} must publish no event: {events:?}"
    );
}

#[test]
fn each_state_change_publishes_its_own_event() {
    let fixture = Fixture::authorized("alice");
    fixture.client.propose_transfer(&fixture.pending);
    assert_published_transfer_event(&fixture, "transfer_pending");

    fixture.client.accept_transfer();
    assert_published_transfer_event(&fixture, "transfer_accepted");
}

#[test]
fn a_cancelled_transfer_publishes_a_cancellation_event() {
    let fixture = Fixture::authorized("alice");
    fixture.client.propose_transfer(&fixture.pending);
    fixture.client.cancel_transfer();
    assert_published_transfer_event(&fixture, "transfer_cancelled");
    assert_eq!(fixture.client.get_pending_transfer(), None);
}

#[test]
fn a_rejected_call_publishes_no_event() {
    let fixture = Fixture::authorized("alice");
    assert_eq!(
        fixture.client.try_accept_transfer(),
        Err(Ok(TagError::NoPendingTransfer)),
        "there is no proposal to accept yet"
    );
    assert_no_events(&fixture.env, "a rejected accept");

    fixture.client.propose_transfer(&fixture.pending);
    fixture.client.accept_transfer();
    assert_eq!(
        fixture.client.try_accept_transfer(),
        Err(Ok(TagError::NoPendingTransfer)),
        "a replayed accept is rejected"
    );
    assert_no_events(&fixture.env, "a replayed accept");
}

// ─── Cross-module fuzz coverage ──────────────────────────────────────────────

#[test]
fn the_harness_corpus_agrees_between_contract_and_normalizer() {
    let env = deterministic_env();
    for case in harness::CORPUS {
        let raw = String::from_bytes(&env, case);
        let inspection = TagContract::inspect_tag(env.clone(), raw);
        let expected = TagName::parse_bytes(case);
        assert_eq!(
            inspection.accepted,
            expected.is_ok(),
            "case {case:?} disagreed between contract and normalizer"
        );
        if let Ok(tag) = expected {
            assert_eq!(
                inspection.byte_len as usize,
                tag.byte_len(),
                "case {case:?}"
            );
            assert_eq!(
                inspection.canonical,
                Symbol::new(&env, tag.as_str()),
                "case {case:?}"
            );
        }
    }
}

#[test]
fn generated_tags_register_and_read_back_unchanged() {
    let env = deterministic_env();
    let mut rng = harness::Rng::new(0xdead_beef_cafe_f00d);
    let mut buffer = [0u8; MAX_RAW_SCAN_BYTES];
    let mut registered = 0u32;

    for _ in 0..64 {
        let len = harness::generate_case(&mut rng, &mut buffer);
        let Ok(tag) = TagName::parse_bytes(&buffer[..len]) else {
            continue;
        };
        // Submit the raw input as a Soroban `String`, which is what a client
        // sends, then confirm the registry stored the canonical form.
        let raw = String::from_bytes(&env, &buffer[..len]);
        let owner = address(&env);
        let client = deploy(&env);
        client.initialize_tag(&owner, &raw);
        assert_eq!(client.get_tag().name, Symbol::new(&env, tag.as_str()));
        registered += 1;
    }

    assert!(registered > 0, "generator produced no acceptable tags");
}
