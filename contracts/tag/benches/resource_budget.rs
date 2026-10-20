//! Deterministic resource budget benchmark for the tag registry.
//!
//! Measures CPU instructions and memory bytes for each representative entry
//! point under the Soroban host budget, then compares them with the ceilings
//! recorded in `budget_ceilings.txt`. Host budget accounting depends only on
//! the contract and the soroban-sdk version, not on the machine, so the
//! numbers are reproducible across runs and CI.
//!
//! Run with:
//! ```text
//! cargo bench --bench resource_budget                  # check against ceilings
//! BUDGET_RECORD=1 cargo bench --bench resource_budget  # print ceilings to record
//! ```

use std::collections::BTreeMap;

use soroban_sdk::{testutils::Address as _, Address, Env, String};
use tag_contract::{TagContract, TagContractClient};

const CEILINGS: &str = include_str!("../budget_ceilings.txt");

struct Sample {
    op: &'static str,
    cpu: u64,
    mem: u64,
}

/// Run `call` with an unlimited budget and report what it consumed.
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

    // Registration on a fresh registry, with a raw tag that needs normalizing.
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register(TagContract, ());
    let client = TagContractClient::new(&env, &id);
    let owner = Address::generate(&env);
    let next_owner = Address::generate(&env);
    let raw = String::from_str(&env, "  @ADA  ");
    samples.push(sample("initialize_tag", &env, || {
        client.initialize_tag(&owner, &raw);
    }));

    // Read-only paths: accepted and rejected candidates, and the state view.
    let accepted = String::from_str(&env, "Ada_01");
    let rejected = String::from_str(&env, "not a tag!");
    samples.push(sample("inspect_tag/accepted", &env, || {
        client.inspect_tag(&accepted);
    }));
    samples.push(sample("inspect_tag/rejected", &env, || {
        client.inspect_tag(&rejected);
    }));
    samples.push(sample("inspect", &env, || {
        client.inspect();
    }));

    // Two-step ownership transfer: propose, then cancel or accept.
    samples.push(sample("propose_transfer", &env, || {
        client.propose_transfer(&next_owner);
    }));
    samples.push(sample("cancel_transfer", &env, || {
        client.cancel_transfer();
    }));
    client.propose_transfer(&next_owner);
    samples.push(sample("accept_transfer", &env, || {
        client.accept_transfer();
    }));

    samples
}

/// Parse `op cpu_insns mem_bytes` lines, skipping blanks and `#` comments.
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
