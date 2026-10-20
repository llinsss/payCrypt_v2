use std::{collections::HashSet, fmt, hash::Hash};

/// Largest page a client requests in one call. Matches the registry contract's
/// `MAX_PAGE_SIZE` so a single invocation never exceeds what the contract allows.
pub const MAX_PAGE_SIZE: u32 = 50;

/// Most pages [`collect_pages`] fetches before failing. Together with
/// [`MAX_PAGE_SIZE`] this caps the work and memory a single walk can use, even
/// if a contract or RPC endpoint keeps returning cursors.
pub const MAX_PAGES: u32 = 100;

/// Longest cursor accepted from a contract response.
pub const MAX_CURSOR_LEN: usize = 256;

/// One page returned by a paginated contract method.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Page<T> {
    pub items: Vec<T>,
    /// `None` on the final page.
    pub next: Option<String>,
}

/// Error codes produced by [`collect_pages`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PaginationError<E> {
    /// The requested page size was zero or above [`MAX_PAGE_SIZE`].
    InvalidPageSize(u32),
    /// A page returned more items than the requested page size.
    PageTooLarge { returned: usize, max: u32 },
    /// A cursor was empty, longer than [`MAX_CURSOR_LEN`], contained non-printable
    /// bytes, or repeated the cursor that produced it.
    MalformedCursor,
    /// An entry key was already returned by an earlier page (1-based page number).
    DuplicateEntry { page: u32 },
    /// More than [`MAX_PAGES`] pages were returned without reaching the final page.
    PageLimitExceeded,
    /// The fetch closure failed, for example with a contract authorization error.
    Fetch(E),
}

impl<E: fmt::Display> fmt::Display for PaginationError<E> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidPageSize(size) => write!(formatter, "invalid page size {size}"),
            Self::PageTooLarge { returned, max } => {
                write!(formatter, "page returned {returned} items, maximum is {max}")
            }
            Self::MalformedCursor => write!(formatter, "malformed or repeated cursor"),
            Self::DuplicateEntry { page } => write!(formatter, "duplicate entry on page {page}"),
            Self::PageLimitExceeded => write!(formatter, "exceeded {MAX_PAGES} pages"),
            Self::Fetch(error) => write!(formatter, "fetch failed: {error}"),
        }
    }
}

fn is_well_formed_cursor(cursor: &str) -> bool {
    !cursor.is_empty()
        && cursor.len() <= MAX_CURSOR_LEN
        && cursor.bytes().all(|byte| byte.is_ascii_graphic())
}

/// Walks a cursor-paginated contract listing from the start and collects every
/// item.
///
/// * `page_size` — items requested per page; must be in `1..=MAX_PAGE_SIZE`.
/// * `fetch` — called with the cursor from the previous page (`None` for the
///   first page) and `page_size`. Errors are returned as [`PaginationError::Fetch`].
/// * `key` — identifies an item. Any key seen twice across pages is a
///   [`PaginationError::DuplicateEntry`].
///
/// Returns every item in page order. The walk stops at the first page whose
/// `next` is `None`. Each call performs at most [`MAX_PAGES`] fetches and holds at
/// most `MAX_PAGES * MAX_PAGE_SIZE` items, so per-call work is bounded. A partial
/// result is never returned: any error discards the items collected so far.
pub fn collect_pages<T, K, E, F, G>(
    page_size: u32,
    mut fetch: F,
    key: G,
) -> Result<Vec<T>, PaginationError<E>>
where
    K: Eq + Hash,
    F: FnMut(Option<&str>, u32) -> Result<Page<T>, E>,
    G: Fn(&T) -> K,
{
    if page_size == 0 || page_size > MAX_PAGE_SIZE {
        return Err(PaginationError::InvalidPageSize(page_size));
    }

    let mut items = Vec::new();
    let mut seen = HashSet::new();
    let mut cursor: Option<String> = None;

    for page_number in 1..=MAX_PAGES {
        let page = fetch(cursor.as_deref(), page_size).map_err(PaginationError::Fetch)?;
        if page.items.len() > page_size as usize {
            return Err(PaginationError::PageTooLarge {
                returned: page.items.len(),
                max: page_size,
            });
        }

        for item in page.items {
            if !seen.insert(key(&item)) {
                return Err(PaginationError::DuplicateEntry { page: page_number });
            }
            items.push(item);
        }

        let Some(next) = page.next else {
            return Ok(items);
        };
        if !is_well_formed_cursor(&next) || cursor.as_deref() == Some(next.as_str()) {
            return Err(PaginationError::MalformedCursor);
        }
        cursor = Some(next);
    }

    Err(PaginationError::PageLimitExceeded)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NetworkProfile {
    pub name: &'static str,
    pub rpc_url: &'static str,
    pub passphrase: &'static str,
}

pub const NETWORKS: [NetworkProfile; 2] = [
    NetworkProfile {
        name: "testnet",
        rpc_url: "https://soroban-testnet.stellar.org",
        passphrase: "Test SDF Network ; September 2015",
    },
    NetworkProfile {
        name: "futurenet",
        rpc_url: "https://rpc-futurenet.stellar.org",
        passphrase: "Test SDF Future Network ; October 2022",
    },
];

pub fn network_profile(name: &str) -> Option<&'static NetworkProfile> {
    NETWORKS.iter().find(|profile| profile.name == name)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TxIntent {
    pub source: String,
    pub token: String,
    pub amount: i128,
    pub resource_budget: ResourceBudget,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResourceBudget {
    pub cpu_instructions: u64,
    pub memory_bytes: u64,
    pub ledger_reads: u32,
    pub ledger_writes: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResourceUsage {
    pub cpu_instructions: u64,
    pub memory_bytes: u64,
    pub ledger_reads: u32,
    pub ledger_writes: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub transaction_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SimulationFailure {
    Authorization,
    UnsupportedToken,
    InvalidAmount,
    InsufficientBalance { available: i128, required: i128 },
    StaleState,
    ResourceBudgetExceeded,
    Rejected(String),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SubmissionFailure {
    pub code: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClientFailure {
    Simulation(SimulationFailure),
    Submission(SubmissionFailure),
}

impl fmt::Display for ClientFailure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Simulation(error) => write!(formatter, "simulation failed: {error:?}"),
            Self::Submission(error) => write!(formatter, "submission failed: {}", error.code),
        }
    }
}

pub trait Simulator {
    type SignedTransaction;

    fn validate_authorization(&self, intent: &TxIntent) -> Result<(), SimulationFailure>;
    fn token_supported(&self, token: &str) -> Result<bool, SimulationFailure>;
    fn balance(&self, source: &str, token: &str) -> Result<i128, SimulationFailure>;
    fn simulate(&self, intent: &TxIntent) -> Result<ResourceUsage, SimulationFailure>;
    fn submit(&self, transaction: &Self::SignedTransaction) -> Result<Receipt, SubmissionFailure>;
}

pub fn simulate_then_submit<S: Simulator>(
    simulator: &S,
    intent: &TxIntent,
    signed_transaction: &S::SignedTransaction,
) -> Result<Receipt, ClientFailure> {
    if intent.amount <= 0 {
        return Err(ClientFailure::Simulation(SimulationFailure::InvalidAmount));
    }
    simulator
        .validate_authorization(intent)
        .map_err(ClientFailure::Simulation)?;
    if !simulator
        .token_supported(&intent.token)
        .map_err(ClientFailure::Simulation)?
    {
        return Err(ClientFailure::Simulation(SimulationFailure::UnsupportedToken));
    }
    let available = simulator
        .balance(&intent.source, &intent.token)
        .map_err(ClientFailure::Simulation)?;
    if available < intent.amount {
        return Err(ClientFailure::Simulation(SimulationFailure::InsufficientBalance {
            available,
            required: intent.amount,
        }));
    }
    let usage = simulator.simulate(intent).map_err(ClientFailure::Simulation)?;
    if usage.cpu_instructions > intent.resource_budget.cpu_instructions
        || usage.memory_bytes > intent.resource_budget.memory_bytes
        || usage.ledger_reads > intent.resource_budget.ledger_reads
        || usage.ledger_writes > intent.resource_budget.ledger_writes
    {
        return Err(ClientFailure::Simulation(SimulationFailure::ResourceBudgetExceeded));
    }
    simulator.submit(signed_transaction).map_err(ClientFailure::Submission)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, env};

    struct FakeSimulator {
        authorized: bool,
        supported: bool,
        balance: i128,
        simulation: Result<ResourceUsage, SimulationFailure>,
        submit_fails: bool,
        submit_calls: Cell<u32>,
    }

    impl Simulator for FakeSimulator {
        type SignedTransaction = String;

        fn validate_authorization(&self, _: &TxIntent) -> Result<(), SimulationFailure> {
            if self.authorized { Ok(()) } else { Err(SimulationFailure::Authorization) }
        }

        fn token_supported(&self, _: &str) -> Result<bool, SimulationFailure> {
            Ok(self.supported)
        }

        fn balance(&self, _: &str, _: &str) -> Result<i128, SimulationFailure> {
            Ok(self.balance)
        }

        fn simulate(&self, _: &TxIntent) -> Result<ResourceUsage, SimulationFailure> {
            self.simulation.clone()
        }

        fn submit(&self, _: &Self::SignedTransaction) -> Result<Receipt, SubmissionFailure> {
            self.submit_calls.set(self.submit_calls.get() + 1);
            if self.submit_fails {
                Err(SubmissionFailure { code: "network_unavailable".into() })
            } else {
                Ok(Receipt { transaction_hash: "hash-1".into() })
            }
        }
    }

    fn intent() -> TxIntent {
        TxIntent {
            source: "G-SOURCE".into(),
            token: "C-USDC".into(),
            amount: 50,
            resource_budget: ResourceBudget {
                cpu_instructions: 1000,
                memory_bytes: 1024,
                ledger_reads: 8,
                ledger_writes: 3,
            },
        }
    }

    fn ready_simulator() -> FakeSimulator {
        FakeSimulator {
            authorized: true,
            supported: true,
            balance: 100,
            simulation: Ok(ResourceUsage {
                cpu_instructions: 900,
                memory_bytes: 900,
                ledger_reads: 7,
                ledger_writes: 2,
            }),
            submit_fails: false,
            submit_calls: Cell::new(0),
        }
    }

    #[test]
    fn stale_state_is_a_simulation_failure_and_never_submits() {
        let mut simulator = ready_simulator();
        simulator.simulation = Err(SimulationFailure::StaleState);
        assert_eq!(
            simulate_then_submit(&simulator, &intent(), &"signed-payload".to_owned()),
            Err(ClientFailure::Simulation(SimulationFailure::StaleState)),
        );
        assert_eq!(simulator.submit_calls.get(), 0);
    }

    #[test]
    fn insufficient_balance_and_auth_failure_never_submit() {
        let mut simulator = ready_simulator();
        simulator.balance = 49;
        assert_eq!(
            simulate_then_submit(&simulator, &intent(), &"signed-payload".to_owned()),
            Err(ClientFailure::Simulation(SimulationFailure::InsufficientBalance { available: 49, required: 50 })),
        );
        simulator.balance = 100;
        simulator.authorized = false;
        assert_eq!(
            simulate_then_submit(&simulator, &intent(), &"signed-payload".to_owned()),
            Err(ClientFailure::Simulation(SimulationFailure::Authorization)),
        );
        assert_eq!(simulator.submit_calls.get(), 0);
    }

    #[test]
    fn unsupported_token_and_non_positive_amount_never_submit() {
        let mut simulator = ready_simulator();
        simulator.supported = false;
        assert_eq!(
            simulate_then_submit(&simulator, &intent(), &"signed-payload".to_owned()),
            Err(ClientFailure::Simulation(SimulationFailure::UnsupportedToken)),
        );
        simulator.supported = true;
        let mut invalid = intent();
        invalid.amount = 0;
        assert_eq!(
            simulate_then_submit(&simulator, &invalid, &"signed-payload".to_owned()),
            Err(ClientFailure::Simulation(SimulationFailure::InvalidAmount)),
        );
        assert_eq!(simulator.submit_calls.get(), 0);
    }

    #[test]
    fn resource_overrun_is_rejected_before_submit() {
        let mut simulator = ready_simulator();
        simulator.simulation = Ok(ResourceUsage {
            cpu_instructions: 1001,
            memory_bytes: 900,
            ledger_reads: 7,
            ledger_writes: 2,
        });
        assert_eq!(
            simulate_then_submit(&simulator, &intent(), &"signed-payload".to_owned()),
            Err(ClientFailure::Simulation(SimulationFailure::ResourceBudgetExceeded)),
        );
        assert_eq!(simulator.submit_calls.get(), 0);
    }

    #[test]
    fn submission_failure_is_distinct_from_simulation_failure() {
        let mut simulator = ready_simulator();
        simulator.submit_fails = true;
        assert_eq!(
            simulate_then_submit(&simulator, &intent(), &"signed-payload".to_owned()),
            Err(ClientFailure::Submission(SubmissionFailure { code: "network_unavailable".into() })),
        );
        assert_eq!(simulator.submit_calls.get(), 1);
    }

    #[test]
    fn ci_network_profile_matches_compatibility_matrix() {
        let Ok(network) = env::var("SOROBAN_NETWORK") else { return };
        let passphrase = env::var("SOROBAN_NETWORK_PASSPHRASE").expect("CI must set network passphrase");
        let profile = network_profile(&network).expect("network must be supported");
        assert_eq!(profile.passphrase, passphrase);
        let matrix: serde_json::Value =
            serde_json::from_str(include_str!("../compatibility.json")).expect("matrix must parse");
        assert!(matrix["networks"].as_array().unwrap().iter().any(|entry| {
            entry["name"] == network && entry["passphrase"] == passphrase && entry["ci"] == true
        }));
    }
}