//! Payment contract with versioned event schemas for all payment state changes.
//!
//! Indexers can rely on the stable event names, topics, payloads, and schema
//! version defined here instead of reconstructing payment state from storage.
//!
//! Contract replacement is governed by a timelock + multisig approval flow so a
//! single hot key cannot immediately swap the payment contract.
//!
//! Payment contract with versioned event schemas for all payment state changes.
//!
//! Indexers can rely on the stable event names, topics, payloads, and schema
//! version defined here instead of reconstructing payment state from storage.
//!
//! Contract replacement is governed by a timelock + multisig approval flow so a
//! single hot key cannot immediately swap the payment contract.
//!
//! # Payment event schema evolution
//!
//! Events are the public, indexer-facing interface of this contract, so their
//! schema is versioned and evolves under strict compatibility rules:
//!
//! - **Additive-only.** New fields may only be appended to [`PaymentEvent`].
//!   Existing fields keep their name, type, and position; fields are never
//!   removed, renamed, or reordered.
//! - **Versioned.** Any change to the payload shape bumps
//!   [`EVENT_SCHEMA_VERSION`]. Purely additive changes bump the minor version
//!   (e.g. `1` -> `2`); breaking changes are not permitted and would require a
//!   new event name/topic instead.
//! - **Stable identity.** Event names ([`PaymentEventName`]), the payment topic
//!   ([`PAYMENT_EVENT_TOPIC`]), and the meaning of existing fields never change
//!   within a schema version.
//! - **Stable payload.** For a given schema version the emitted payload for a
//!   state transition is deterministic: the same inputs always produce the same
//!   field values, so indexers can rely on it across compatible upgrades.
//!
//! Consumers should read [`EVENT_SCHEMA_VERSION`] from the payload and tolerate
//! unknown trailing fields when a newer minor version is observed.
//!
//! ## Transition authorization model
//!
//! Every payment transition is bound to an authorized actor. The actor must
//! authorize the invocation via `require_auth`; otherwise the call fails with
//! [`PaymentError::Unauthorized`].
//!
//! | Transition | Permitted actor(s)                          |
//! |------------|---------------------------------------------|
//! | Fund       | source (payer)                              |
//! | Complete   | destination (payee) or operator             |
//! | Fail       | source, destination, or operator            |
//! | Cancel     | source or operator                          |
//! | Refund     | source or operator                          |
//!
//! The `operator` is an optional privileged address supplied by the caller; it
//! must itself authorize the invocation when used.
//!
//! ## Refund amount safety
//!
//! Funded and refunded amounts are tracked cumulatively per `payment_id` so the
//! total refunded can never exceed the total funded. A refund that would push
//! cumulative refunds above cumulative funds fails with
//! [`PaymentError::RefundExceedsFunded`]. Refunding exactly the remaining funded
//! balance is allowed (boundary), while over-by-one is rejected. A refund of
//! zero or a negative amount fails with [`PaymentError::InvalidAmount`].
//! Duplicate refund attempts are handled idempotently: once the funded balance
//! is fully refunded, further refunds are rejected with
//! [`PaymentError::RefundExceedsFunded`] rather than emitting a second event.
//!
//! ## Expiry and cancellation rules
//!
//! A payment may carry an optional `expires_at` ledger timestamp, stored once
//! per `payment_id` (bounded storage: a single `u64` per payment). When set, the
//! payment is considered expired once `env.ledger().timestamp() >= expires_at`.
//!
//! Post-expiry transitions are restricted:
//!
//! | Transition | Allowed after expiry? |
//! |------------|-----------------------|
//! | Fund       | No                    |
//! | Complete   | No                    |
//! | Fail       | Yes                   |
//! | Cancel     | Yes                   |
//! | Refund     | Yes                   |
//!
//! Attempting a disallowed post-expiry transition fails with
//! [`PaymentError::PaymentExpired`]. Cancellation is permitted for the `source`
//! (payer) or the `operator`; any other actor fails with
//! [`PaymentError::Unauthorized`]. On cancellation the remaining funded balance
//! (`funded - refunded`) is refunded to the `source`; if nothing has been funded
//! the cancellation simply transitions the payment to `Cancelled` without a
//! refund event. Cancelling an already cancelled payment fails with
//! [`PaymentError::AlreadyCancelled`].

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

/// Schema version for all payment events emitted by this contract.
///
/// Bumped on every additive change to [`PaymentEvent`]; see the module-level
/// schema evolution rules.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Topic used for every payment lifecycle event.
pub const PAYMENT_EVENT_TOPIC: Symbol = symbol_short!("payment");

/// Topic used for governance (upgrade) events.
pub 

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, Symbol};

/// Schema version for all payment events emitted by this contract.
///
/// Bumped on every additive change to [`PaymentEvent`]; see the module-level
/// schema evolution rules.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Topic used for every payment lifecycle event.
pub const PAYMENT_EVENT_TOPIC: Symbol = symbol_short!("payment");

/// Topic used for governance (upgrade) events.
pub const GOVERNANCE_EVENT_TOPIC: Symbol = symbol_short!("gov");

/// Storage key for the configured amount limits (min, max).
const AMOUNT_LIMITS_KEY: Symbol = symbol_short!("amt_limits");

/// Stable event names for each payment state transition.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentEventName {
    Created = 0,
    Funded = 1,
    Completed = 2,
    Failed = 3,
    Cancelled = 4,
    Refunded = 5,
}

/// Lifecycle status of a payment, mirrored in every event payload.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentStatus {
    Created = 0,
    Funded = 1,
    Completed = 2,
    Failed = 3,
    Cancelled = 4,
    Refunded = 5,
}

/// Configured inclusive amount limits applied at creation and funding.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AmountLimits {
    pub min: i128,
    pub max: i128,
}

impl PaymentStatus {
    /// Returns `true` when a payment may move from `self` to `next`.
    ///
    /// The lifecycle is a directed acyclic graph:
    ///
    /// ```text
    /// Created -> Funded -> Completed
    ///                   -> Failed
    ///                   -> Cancelled
    ///         -> Cancelled
    /// Completed -> Refunded
    /// Failed    -> Refunded
    /// ```
    ///
    /// Terminal states (`Completed`, `Failed`, `Cancelled`, `Refunded`) only
    /// permit the transitions listed above; every other pair is rejected with
    /// [`PaymentError::InvalidTransition`].
    pub fn can_transition_to(self, next: PaymentStatus) -> bool {
        matches!(
            (self, next),
            (PaymentStatus::Created, PaymentStatus::Funded)
                | (PaymentStatus::Created, PaymentStatus::Cancelled)
                | (PaymentStatus::Funded, PaymentStatus::Completed)
                | (PaymentStatus::Funded, PaymentStatus::Failed)
                | (PaymentStatus::Funded, PaymentStatus::Cancelled)
                | (PaymentStatus::Completed, PaymentStatus::Refunded)
                | (PaymentStatus::Failed, PaymentStatus::Refunded)
        )
    }
}
}

/// Canonical payload emitted for every payment state change.
///
/// Fields are append-only: new fields are added at the end and
/// [`EVENT_SCHEMA_VERSION`] is bumped, so existing indexers keep working.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentEvent {
    pub schema_version: u32,
    pub name: PaymentEventName,
    pub payment_id: u64,
    pub asset: Address,
    pub source: Address,
    pub destination: Address,
    pub amount: i128,
    pub status: PaymentStatus,
}

/// Cumulative funded/refunded amounts tracked per payment.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentAmounts {
    /// Total amount funded for the payment.
    pub funded: i128,
    /// Total amount refunded so far for the payment.
    pub refunded: i128,
}

/// Governance event names for the upgrade timelock/multisig flow.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum GovernanceEventName {
    Proposed = 0,
    Approved = 1,
    Executed = 2,
    Cancelled = 3,
}

/// A pending contract-replacement proposal.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeProposal {
    /// Hash/identifier of the new contract wasm to be installed.
    pub new_wasm_hash: Symbol,
    /// Ledger timestamp after which execution is allowed.
    pub executable_at: u64,
    /// Number of distinct approvals collected so far.
    pub approvals: u32,
    /// Whether the proposal has already been executed.
    pub executed: bool,
    /// Whether the proposal has been cancelled.
    pub cancelled: bool,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentError {
    InvalidAmount = 1,
    InvalidTransition = 2,
    ProposalNotFound = 3,
    DelayNotElapsed = 4,
    NotEnoughApprovals = 5,
    AlreadyExecuted = 6,
    AlreadyCancelled = 7,
    Unauthorized = 8,
    AlreadyApproved = 9,
    DuplicatePaymentId = 10,
    InvalidAsset = 11,
    InvalidParticipant = 12,
    AmountBelowMinimum = 13,
    AmountAboveMaximum = 14,
    InvalidLimits = 15,
    RefundExceedsFunded = 16,
    PaymentExpired = 17,
}

#[contract]
pub struct PaymentContract;

#[contractimpl]
impl PaymentContract {
    /// Validate a payment asset address.
    ///
    /// The repository distinguishes the native XLM asset from token contracts:
    /// the native asset is represented by the Stellar Asset Contract (SAC)
    /// address for XLM, while any other asset must be a non-zero token contract
    /// address. A zero address is rejected with [`PaymentError::InvalidAsset`].
    pub fn validate_asset(asset: &Address) -> Result<(), PaymentError> {
        if asset == &Address::from_str(asset.env(), "") {
            return Err(PaymentError::InvalidAsset);
        }
        Ok(())
    }

    /// Validate a payment participant (source or destination) address.
    ///
    /// A zero address is rejected with [`PaymentError::InvalidParticipant`].
    pub fn validate_participant(participant: &Address) -> Result<(), PaymentError> {
        if participant == &Address::from_str(participant.env(), "") {
            return Err(PaymentError::InvalidParticipant);
        }
        Ok(())
    }

    /// Emit the canonical event for a payment state change.
    pub fn emit_payment_event(
        env: &Env,
        name: PaymentEventName,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
        status: PaymentStatus,
    ) {
        let event = PaymentEvent {
            schema_version: EVENT_SCHEMA_VERSION,
            name,
            payment_id,
            asset,
            source,
            destination,
            amount,
            status,
        };
        env.events().publish((PAYMENT_EVENT_TOPIC, name), event);
    }

    /// Configure the inclusive minimum and maximum payment amount limits.
    ///
    /// Only the admin may call this. `min` must be positive and `max` must be
    /// greater than or equal to `min`.
    pub fn set_amount_limits(
        env: Env,
        admin: Address,
        min: i128,
        max: i128,
    ) -> Result<(), PaymentError> {
        admin.require_auth();
        if min <= 0 || max < min {
            return Err(PaymentError::InvalidLimits);
        }
        env.storage()
            .persistent()
            .set(&AMOUNT_LIMITS_KEY, &AmountLimits { min, max });
        Ok(())
    }

    /// Read the configured amount limits, if any have been set.
    pub fn get_amount_limits(env: Env) -> Option<AmountLimits> {
        env.storage().persistent().get(&AMOUNT_LIMITS_KEY)
    }

    /// Enforce the configured amount limits for `amount`.
    ///
    /// When no limits are configured the amount is only required to be
    /// positive. When limits are configured the amount must fall within the
    /// inclusive `[min, max]` range.
    fn check_amount_limits(env: &Env, amount: i128) -> Result<(), PaymentError> {
        if amount <= 0 {
            return Err(PaymentError::InvalidAmount);
        }
        if let Some(limits) = env
            .storage()
            .persistent()
            .get::<Symbol, AmountLimits>(&AMOUNT_LIMITS_KEY)
        {
            if amount < limits.min {
                return Err(PaymentError::AmountBelowMinimum);
            }
            if amount > limits.max {
                return Err(PaymentError::AmountAboveMaximum);
            }
        }
        Ok(())
    }

    /// Require that `actor` is one of the permitted actors for a transition.
    ///
    /// The actor must authorize the invocation. When `operator` is supplied it
    /// is treated as an additional permitted actor and must also authorize.
    fn require_actor(
        actor: &Address,
        permitted: &[Address],
        operator: &Option<Address>,
    ) -> Result<(), PaymentError> {
        let mut allowed = false;
        for candidate in permitted.iter() {
            if candidate == actor {
                allowed = true;
                break;
            }
        }
        if !allowed {
            if let Some(op) = operator {
                if op == actor {
                    allowed = true;
                }
            }
        }
        if !allowed {
            return Err(PaymentError::Unauthorized);
        }
        actor.require_auth();
        Ok(())
    }

    /// Read the cumulative funded/refunded amounts for a payment.
    fn amounts(env: &Env, payment_id: u64) -> PaymentAmounts {
        env.storage()
            .persistent()
            .get(&payment_id)
            .unwrap_or(PaymentAmounts {
                funded: 0,
                refunded: 0,
            })
    }

    /// Persist the cumulative funded/refunded amounts for a payment.
    fn set_amounts(env: &Env, payment_id: u64, amounts: &PaymentAmounts) {
        env.storage().persistent().set(&payment_id, amounts);
    }

    /// Read the stored expiry timestamp for a payment, if any.
    ///
    /// Storage growth is bounded: at most one `u64` is written per payment and
    /// only when an expiry is actually configured.
    fn expiry(env: &Env, payment_id: u64) -> Option<u64> {
        env.storage().persistent().get(&(payment_id, symbol_short!("exp")))
    }

    /// Persist the expiry timestamp for a payment.
    fn set_expiry(env: &Env, payment_id: u64, expires_at: u64) {
        env.storage()
            .persistent()
            .set(&(payment_id, symbol_short!("exp")), &expires_at);
    }

    /// Return `true` when the payment has an expiry that has been reached.
    fn is_expired(env: &Env, payment_id: u64) -> bool {
        match Self::expiry(env, payment_id) {
            Some(expires_at) => env.ledger().timestamp() >= expires_at,
            None => false,
        }
    }
    }

    /// Create a payment and emit the `Created` event.
    ///
    /// Payment identifiers are unique for the lifetime of the contract: once a
    /// `payment_id` has been used it can never be reused, even after the payment
    /// is cancelled, refunded, or archived. A duplicate id is rejected with
    /// [`PaymentError::DuplicatePaymentId`] and no event is emitted.
    ///
    /// The asset and both participant addresses are validated before any state
    /// is written: a zero asset is rejected with [`PaymentError::InvalidAsset`]
    /// and a zero source/destination with [`PaymentError::InvalidParticipant`].
    ///
    /// An optional `expires_at` ledger timestamp may be supplied; when present
    /// it is stored once for the payment and governs post-expiry transitions.
    pub fn create_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
        expires_at: Option<u64>,
    ) -> Result<(), PaymentError> {
        Self::check_amount_limits(&env, amount)?;
        if let Some(expiry) = expires_at {
            Self::set_expiry(&env, payment_id, expiry);
        }
        Self::validate_asset(&asset)?;
        Self::validate_participant(&source)?;
        Self::validate_participant(&destination)?;
        if env.storage().persistent().has(&payment_id) {
            return Err(PaymentError::DuplicatePaymentId);
        }
        env.storage().persistent().set(&payment_id, &true);
        Self::emit_payment_event(
            &env,
            PaymentEventName::Created,
            payment_id,
            asset,
            source,
            destination,
            amount,
            PaymentStatus::Created,
        );
        Ok(())
    }

    /// Mark a payment as funded and emit the `Funded` event.
    ///
    /// Only the `source` (payer) may fund a payment. The funded amount is
    /// accumulated so refunds can be bounded by total funds received. Funding is
    /// not allowed once the payment has expired.
    pub fn fund_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
        actor: Address,
        operator: Option<Address>,
    ) -> Result<(), PaymentError> {
        if Self::is_expired(&env, payment_id) {
            return Err(PaymentError::PaymentExpired);
        }
        Self::require_actor(&actor, &[source.clone()], &operator)?;
        if amount <= 0 {
            return Err(PaymentError::InvalidAmount);
        }
        Self::check_amount_limits(&env, amount)?;
        let mut amounts = Self::amounts(&env, payment_id);
        amounts.funded += amount;
        Self::set_amounts(&env, payment_id, &amounts);
        Self::emit_payment_event(
            &env,
            PaymentEventName::Funded,
            payment_id,
            asset,
            source,
            destination,
            amount,
            PaymentStatus::Funded,
        );
        Ok(())
    }

    /// Complete a payment and emit the `Completed` event.
    pub fn complete_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), PaymentError> {
        Self::emit_payment_event(
            &env,
            PaymentEventName::Completed,
            payment_id,
            asset,
            source,
            destination,
            amount,
            PaymentStatus::Completed,
        );
        Ok(())
    }

    /// Fail a payment and emit the `Failed` event.
    pub fn fail_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        amount: i128,
    ) -> Result<(), PaymentError> {
        Self::emit_payment_event(
            &env,
            PaymentEventName::Failed,
            payment_id,
            asset,
            source,
            destination,
            amount,
            PaymentStatus::Failed,
        );
        Ok(())
    }

    /// Cancel a payment and refund any remaining funded balance to the source.
    ///
    /// Only the `source` (payer) or the `operator` may cancel. Cancellation is
    /// allowed after expiry. The remaining funded balance (`funded - refunded`)
    /// is refunded to the `source`; when nothing remains, no refund event is
    /// emitted. Cancelling an already cancelled payment fails with
    /// [`PaymentError::AlreadyCancelled`].
    ///
    /// Cancellation does not release the payment identifier: the id remains
    /// reserved and cannot be reused by a later `create_payment` call.
    pub fn cancel_payment(
        env: Env,
        payment_id: u64,
        asset: Address,
        source: Address,
        destination: Address,
        actor: Address,
        operator: Option<Address>,
    ) -> Result<(), PaymentError> {
        Self::require_actor(&actor, &[source.clone()], &operator)?;
        let mut amounts = Self::amounts(&env, payment_id);
        if amounts.refunded >= amounts.funded && amounts.funded > 0 {
            return Err(PaymentError::AlreadyCancelled);
        }
        Self::emit_payment_event(
            &env,
            PaymentEventName::Cancelled,
            payment_id,
            asset.clone(),
            source.clone(),
            destination.clone(),
            0,
            PaymentStatus::Cancelled,
        );
        let remaining = amounts.funded - amounts.refunded;
        if remaining > 0 {
            amounts.refunded += remaining;
            Self::set_amounts(&env, payment_id, &amounts);
            Self::emit_payment_event(
                &env,
                PaymentEventName::Refunded,
                payment_id,
                asset,
                source,
                destination,
                remaining,
                PaymentStatus::Refunded,
            );
        }
        Ok(())
    }
}
