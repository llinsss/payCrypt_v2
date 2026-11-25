//! Deterministic storage-footprint benchmark for the wallet contract.
//!
//! Measures CPU instructions and memory bytes for each hot-path entry point
//! under the Soroban host budget, then compares them with the ceilings in
//! `budget_ceilings.txt`. Budget figures depend only on the contract and the
//! soroban-sdk version, not the machine, so they are reproducible across runs
//! and in CI.
//!
//! Run with:
//! ```text
//! cargo bench --bench storage_footprint                  # check against ceilings
//! BUDGET_RECORD=1 cargo bench --bench storage_footprint  # print ceilings to record
//! ```

use std::collections::BTreeMap;

use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::StellarAssetClient,
    Address, Env, Vec,
};
use wallet_contract::{WalletContract, WalletContractClient};

const CEILINGS: &str = include_str!("../budget_ceilings.txt");

struct Sample {
    op: &'static str,
    cpu: u64,
    mem: u64,
}

fn sample<F: FnOnce()>(op: &'static str, env: &Env, call: F) -> Sample {
    env.cost_estimate().budget().reset_unlimited();
    call();
    let budget = env.cost_estimate().budget();
    Sample {
        op,
        cpu: budget.cpu_instruction_cost(),
        mem: budget.memory_bytes_cost(),
    }
}

fn run_all() -> Vec<Sample> {
    let mut samples = Vec::new();

    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let signer_a = Address::generate(&env);
    let signer_b = Address::generate(&env);
    let destination = Address::generate(&env);
    let wallet_id = env.register(WalletContract, ());
    let wallet = WalletContractClient::new(&env, &wallet_id);
    let signers = soroban_sdk::Vec::from_array(&env, [signer_a.clone(), signer_b.clone()]);
    wallet.initialize(&admin, &signers, &1, &1_000_000, &false);

    let token_admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(token_admin).address();
    wallet.set_token_supported(&admin, &token, &true);
    StellarAssetClient::new(&env, &token).mint(&wallet.address, &1_000_000);
    env.ledger().set_timestamp(1000);

    samples.push(sample("propose_withdrawal", &env, || {
        wallet.propose_withdrawal(&signer_a, &token, &destination, &100, &999_999_999);
    }));

    // approve + execute on a fresh proposal (threshold=1 so proposer auto-approves)
    let pid = wallet.propose_withdrawal(&signer_a, &token, &destination, &100, &999_999_999);
    samples.push(sample("execute", &env, || {
        wallet.execute(&signer_a, &pid);
    }));

    // is_signer read path
    samples.push(sample("is_signer", &env, || {
        wallet.is_signer(&signer_a);
    }));

    // threshold read path
    samples.push(sample("threshold", &env, || {
        wallet.threshold();
    }));

    samples
}

fn parse_ceilings() -> BTreeMap<&'static str, (u64, u64)> {
    let mut ceilings = BTreeMap::new();
    for line in CEILINGS.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut fields = line.split_whitespace();
        let op = fields.next().expect("ceiling line has an operation name");
        let cpu = fields
            .next()
            .and_then(|v| v.parse().ok())
            .expect("ceiling line has a numeric cpu_insns");
        let mem = fields
            .next()
            .and_then(|v| v.parse().ok())
            .expect("ceiling line has a numeric mem_bytes");
        ceilings.insert(op, (cpu, mem));
    }
    ceilings
}

fn main() {
    let samples = run_all();

    if std::env::var_os("BUDGET_RECORD").is_some() {
        for s in &samples {
            println!("{} {} {}", s.op, s.cpu, s.mem);
        }
        return;
    }

    let ceilings = parse_ceilings();
    let mut failures = Vec::new();
    for s in &samples {
        println!("bench {:<24} cpu {:>12}  mem {:>10}", s.op, s.cpu, s.mem);
        match ceilings.get(s.op) {
            None => failures.push(format!("{}: no recorded ceiling", s.op)),
            Some(&(cpu_max, mem_max)) => {
                if s.cpu > cpu_max {
                    failures.push(format!("{}: cpu {} exceeds ceiling {}", s.op, s.cpu, cpu_max));
                }
                if s.mem > mem_max {
                    failures.push(format!("{}: mem {} exceeds ceiling {}", s.op, s.mem, mem_max));
                }
            }
        }
    }

    if !failures.is_empty() {
        for failure in &failures {
            eprintln!("budget violation: {failure}");
        }
        std::process::exit(1);
    }
}
