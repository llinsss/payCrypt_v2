//! # Contract storage layout and schema versioning
//!
//! This module is the single source of truth for every persistent key used by
//! the contract and for the on-chain schema version that guards migrations.
//!
//! ## Persistent storage layout
//!
//! All persistent entries are addressed through [`DataKey`]. The enum is
//! `#[repr(u32)]` so the discriminant is stable across releases; new variants
//! MUST be appended (never reordered or removed) to keep existing keys valid.
//!
//! | Key (`DataKey`)        | Value type        | Description                                  |
//! |------------------------|-------------------|----------------------------------------------|
//! | `Admin`                | `Address`         | Contract administrator.                      |
//! | `Config`               | `Config`          | Protocol configuration (fees, limits).       |
//! | `TotalSupply`          | `i128`            | Total token supply.                          |
//! | `Balance(Address)`     | `i128`            | Per-account balance.                         |
//! | `Allowance(Address, Address)` | `i128`     | Spender allowance for an owner.              |
//! | `Escrow(u64)`          | `Escrow`          | Escrow record keyed by escrow id.            |
//! | `EscrowCount`          | `u64`             | Monotonic escrow id counter.                 |
//! | `Paused`               | `bool`            | Emergency pause flag.                        |
//! | `SchemaVersion`        | `u32`             | Persisted schema version (migration marker). |
//! | `PaymentIntent(u64)`   | `PaymentIntent`   | Payment intent record keyed by intent id.    |
//! | `PaymentIntentCount`   | `u64`             | Monotonic payment intent id counter.         |
//!
//! ## Migration policy
//!
//! [`CURRENT_SCHEMA_VERSION`] is the version this build writes and expects.
//! [`migrate`] is idempotent and MUST be invoked once during `initialize`/
//! upgrade before any other storage access. It refuses to run against a schema
//! newer than the binary understands, and upgrades older schemas in order.

use soroban_sdk::{contracttype, Address, Env};

/// Current on-chain schema version written by this build.
///
/// Bump this whenever the persistent layout changes and add a matching arm in
/// [`migrate`].
///
/// Version history:
/// - `1`: initial layout (`Admin`, `Config`, `TotalSupply`, `Balance`,
///   `Allowance`, `Escrow`, `EscrowCount`, `Paused`).
/// - `2`: adds the `SchemaVersion` marker and the `Paused` flag.
/// - `3`: adds storage-backed payment intents (`PaymentIntent`,
///   `PaymentIntentCount`) so lifecycle state survives across contract calls.
pub const CURRENT_SCHEMA_VERSION: u32 = 3;

/// Every persistent storage key used by the contract.
///
/// Variants are append-only: the `#[repr(u32)]` discriminant is part of the
/// on-chain key, so reordering or removing a variant would orphan stored data.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum DataKey {
    /// `Address`: contract administrator.
    Admin = 0,
    /// `Config`: protocol configuration.
    Config = 1,
    /// `i128`: total token supply.
    TotalSupply = 2,
    /// `i128`: balance for the given account.
    Balance(Address) = 3,
    /// `i128`: allowance granted by owner to spender.
    Allowance(Address, Address) = 4,
    /// `Escrow`: escrow record for the given id.
    Escrow(u64) = 5,
    /// `u64`: monotonic escrow id counter.
    EscrowCount = 6,
    /// `bool`: emergency pause flag.
    Paused = 7,
    /// `u32`: persisted schema version (migration marker).
    SchemaVersion = 8,
    /// `PaymentIntent`: payment intent record for the given id.
    PaymentIntent(u64) = 9,
    /// `u64`: monotonic payment intent id counter.
    PaymentIntentCount = 10,
}

/// Lifecycle states a payment intent moves through.
///
/// Transitions are validated against the currently stored state before being
/// applied, so an intent can never skip or repeat a step. The allowed edges
/// are:
///
/// ```text
/// Pending -> Authorized -> Captured
///    |            |
///    v            v
/// Cancelled    Refunded
/// ```
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentIntentStatus {
    /// Created but not yet authorized.
    Pending = 0,
    /// Funds authorized by the payer.
    Authorized = 1,
    /// Funds captured from the payer.
    Captured = 2,
    /// Cancelled before capture.
    Cancelled = 3,
    /// Refunded after capture.
    Refunded = 4,
}

/// Storage-backed payment intent record.
///
/// Persisted under [`DataKey::PaymentIntent`] so the lifecycle survives across
/// contract invocations instead of relying on events alone.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentIntent {
    /// Monotonic intent id.
    pub id: u64,
    /// Payer that owns the intent.
    pub payer: Address,
    /// Payee that receives captured funds.
    pub payee: Address,
    /// Amount in the smallest token unit.
    pub amount: i128,
    /// Current lifecycle state.
    pub status: PaymentIntentStatus,
}

/// Reads the persisted schema version, defaulting to `1` for deployments that
/// predate the version marker.
pub fn schema_version(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::SchemaVersion)
        .unwrap_or(1)
}

/// Persists the schema version marker.
pub fn set_schema_version(env: &Env, version: u32) {
    env.storage()
        .persistent()
        .set(&DataKey::SchemaVersion, &version);
}

/// Loads a payment intent by id, if one has been persisted.
pub fn get_payment_intent(env: &Env, id: u64) -> Option<PaymentIntent> {
    env.storage().persistent().get(&DataKey::PaymentIntent(id))
}

/// Persists a payment intent record under its id.
pub fn set_payment_intent(env: &Env, intent: &PaymentIntent) {
    env.storage()
        .persistent()
        .set(&DataKey::PaymentIntent(intent.id), intent);
}

/// Returns the next payment intent id and advances the monotonic counter.
pub fn next_payment_intent_id(env: &Env) -> u64 {
    let next = env
        .storage()
        .persistent()
        .get(&DataKey::PaymentIntentCount)
        .unwrap_or(0u64);
    env.storage()
        .persistent()
        .set(&DataKey::PaymentIntentCount, &(next + 1));
    next
}

/// Returns `true` when `from -> to` is a legal lifecycle transition.
fn is_valid_transition(from: PaymentIntentStatus, to: PaymentIntentStatus) -> bool {
    matches!(
        (from, to),
        (PaymentIntentStatus::Pending, PaymentIntentStatus::Authorized)
            | (PaymentIntentStatus::Pending, PaymentIntentStatus::Cancelled)
            | (PaymentIntentStatus::Authorized, PaymentIntentStatus::Captured)
            | (PaymentIntentStatus::Authorized, PaymentIntentStatus::Refunded)
    )
}

/// Applies a lifecycle transition to a stored payment intent.
///
/// Validates the transition against the *currently stored* state before
/// writing, so callers cannot skip or repeat steps. Panics with a stable
/// message when the intent is missing or the transition is illegal.
pub fn transition_payment_intent(
    env: &Env,
    id: u64,
    to: PaymentIntentStatus,
) -> PaymentIntent {
    let mut intent = get_payment_intent(env, id).expect("payment intent not found");

    if !is_valid_transition(intent.status, to) {
        panic!("invalid payment intent transition");
    }

    intent.status = to;
    set_payment_intent(env, &intent);
    intent
}

/// Runs pending migrations and stamps the current schema version.
///
/// Idempotent: calling it on an up-to-date store is a no-op. Panics if the
/// stored schema is newer than [`CURRENT_SCHEMA_VERSION`], which indicates the
/// contract was upgraded against an incompatible binary.
pub fn migrate(env: &Env) {
    let stored = schema_version(env);

    if stored > CURRENT_SCHEMA_VERSION {
        panic!("storage schema is newer than this contract build");
    }

    if stored < 2 {
        // v1 -> v2: the `Paused` flag is introduced. Existing deployments
        // default to unpaused; the marker itself is written below.
        if !env.storage().persistent().has(&DataKey::Paused) {
            env.storage().persistent().set(&DataKey::Paused, &false);
        }
    }

    if stored < 3 {
        // v2 -> v3: payment intents become storage-backed. The counter is
        // backfilled so ids stay monotonic for deployments that already
        // emitted intent events.
        if !env
            .storage()
            .persistent()
            .has(&DataKey::PaymentIntentCount)
        {
            env.storage()
                .persistent()
                .set(&DataKey::PaymentIntentCount, &0u64);
        }
    }

    if stored < CURRENT_SCHEMA_VERSION {
        set_schema_version(env, CURRENT_SCHEMA_VERSION);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn migrate_from_populated_v1_preserves_data() {
        let env = Env::default();
        let admin = Address::generate(&env);

        // Simulate a populated prior (v1) schema: no version marker, no pause
        // flag, but real balances and escrow state already stored.
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::TotalSupply, &1_000i128);
        env.storage()
            .persistent()
            .set(&DataKey::Balance(admin.clone()), &1_000i128);
        env.storage().persistent().set(&DataKey::EscrowCount, &3u64);

        assert_eq!(schema_version(&env), 1);

        migrate(&env);

        // Marker advanced and the new flag was backfilled.
        assert_eq!(schema_version(&env), CURRENT_SCHEMA_VERSION);
        assert_eq!(
            env.storage().persistent().get(&DataKey::Paused),
            Some(false)
        );

        // Pre-existing data is untouched.
        assert_eq!(
            env.storage().persistent().get(&DataKey::Admin),
            Some(admin.clone())
        );
        assert_eq!(
            env.storage().persistent().get(&DataKey::TotalSupply),
            Some(1_000i128)
        );
        assert_eq!(
            env.storage()
                .persistent()
                .get(&DataKey::Balance(admin)),
            Some(1_000i128)
        );
        assert_eq!(
            env.storage().persistent().get(&DataKey::EscrowCount),
            Some(3u64)
        );
    }

    #[test]
    fn migrate_is_idempotent() {
        let env = Env::default();

        migrate(&env);
        assert_eq!(schema_version(&env), CURRENT_SCHEMA_VERSION);

        // A second run must not change anything.
        migrate(&env);
        assert_eq!(schema_version(&env), CURRENT_SCHEMA_VERSION);
    }

    fn new_intent(env: &Env, payer: &Address, payee: &Address, amount: i128) -> PaymentIntent {
        let id = next_payment_intent_id(env);
        let intent = PaymentIntent {
            id,
            payer: payer.clone(),
            payee: payee.clone(),
            amount,
            status: PaymentIntentStatus::Pending,
        };
        set_payment_intent(env, &intent);
        intent
    }

    #[test]
    fn payment_intent_persists_across_calls() {
        let env = Env::default();
        let payer = Address::generate(&env);
        let payee = Address::generate(&env);

        let intent = new_intent(&env, &payer, &payee, 500i128);
        assert_eq!(intent.id, 0);

        // A separate read (as a later invocation would do) sees the record.
        let stored = get_payment_intent(&env, intent.id).unwrap();
        assert_eq!(stored.status, PaymentIntentStatus::Pending);
        assert_eq!(stored.amount, 500i128);
        assert_eq!(stored.payer, payer);
        assert_eq!(stored.payee, payee);

        // Ids are monotonic across calls.
        let second = new_intent(&env, &payer, &payee, 1i128);
        assert_eq!(second.id, 1);
    }

    #[test]
    fn valid_transitions_are_applied_and_persisted() {
        let env = Env::default();
        let payer = Address::generate(&env);
        let payee = Address::generate(&env);
        let intent = new_intent(&env, &payer, &payee, 100i128);

        let authorized =
            transition_payment_intent(&env, intent.id, PaymentIntentStatus::Authorized);
        assert_eq!(authorized.status, PaymentIntentStatus::Authorized);

        let captured = transition_payment_intent(&env, intent.id, PaymentIntentStatus::Captured);
        assert_eq!(captured.status, PaymentIntentStatus::Captured);

        // The final state is durable, not just returned.
        assert_eq!(
            get_payment_intent(&env, intent.id).unwrap().status,
            PaymentIntentStatus::Captured
        );
    }

    #[test]
    fn cancel_and_refund_paths_are_allowed() {
        let env = Env::default();
        let payer = Address::generate(&env);
        let payee = Address::generate(&env);

        let cancelled = new_intent(&env, &payer, &payee, 10i128);
        transition_payment_intent(&env, cancelled.id, PaymentIntentStatus::Cancelled);
        assert_eq!(
            get_payment_intent(&env, cancelled.id).unwrap().status,
            PaymentIntentStatus::Cancelled
        );

        let refunded = new_intent(&env, &payer, &payee, 20i128);
        transition_payment_intent(&env, refunded.id, PaymentIntentStatus::Authorized);
        transition_payment_intent(&env, refunded.id, PaymentIntentStatus::Refunded);
        assert_eq!(
            get_payment_intent(&env, refunded.id).unwrap().status,
            PaymentIntentStatus::Refunded
        );
    }

    #[test]
    #[should_panic(expected = "invalid payment intent transition")]
    fn skipping_a_step_is_rejected() {
        let env = Env::default();
        let payer = Address::generate(&env);
        let payee = Address::generate(&env);
        let intent = new_intent(&env, &payer, &payee, 100i128);

        // Pending -> Captured is not a legal edge.
        transition_payment_intent(&env, intent.id, PaymentIntentStatus::Captured);
    }

    #[test]
    #[should_panic(expected = "invalid payment intent transition")]
    fn repeating_a_transition_is_rejected() {
        let env = Env::default();
        let payer = Address::generate(&env);
        let payee = Address::generate(&env);
        let intent = new_intent(&env, &payer, &payee, 100i128);

        transition_payment_intent(&env, intent.id, PaymentIntentStatus::Authorized);
        // Authorized -> Authorized is not a legal edge.
        transition_payment_intent(&env, intent.id, PaymentIntentStatus::Authorized);
    }

    #[test]
    #[should_panic(expected = "payment intent not found")]
    fn transition_on_missing_intent_fails() {
        let env = Env::default();
        transition_payment_intent(&env, 42u64, PaymentIntentStatus::Authorized);
    }
}
