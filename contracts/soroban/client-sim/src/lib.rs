use std::fmt;

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