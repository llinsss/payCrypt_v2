//! Reproducible Soroban deployment tooling (issue #749).
//!
//! A Rust-native deployment command that validates the network, admin,
//! contract WASM hash, constructor arguments, and target addresses before
//! submission. Supports dry-run and explicit network selection, writes a
//! deployment manifest (ledger, hash, IDs), and refuses accidental mainnet
//! deployment without confirmation.
//!
//! Usage:
//!   cargo run --bin deploy -- \
//!     --network testnet \
//!     --wasm target/wasm32-unknown-unknown/release/contract.wasm \
//!     --wasm-hash <sha256-hex> \
//!     --admin G... \
//!     --constructor-arg <value> \
//!     --address G... \
//!     [--dry-run] [--confirm-mainnet] [--manifest deployment.json]

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process;

/// Networks we are willing to deploy to. Explicit selection is required.
const KNOWN_NETWORKS: &[&str] = &["testnet", "futurenet", "local", "mainnet"];

/// Networks that require an explicit confirmation flag.
const CONFIRMATION_NETWORKS: &[&str] = &["mainnet"];

#[derive(Debug, Default)]
struct DeployArgs {
    network: Option<String>,
    wasm: Option<PathBuf>,
    wasm_hash: Option<String>,
    admin: Option<String>,
    constructor_args: Vec<String>,
    addresses: Vec<String>,
    dry_run: bool,
    confirm_mainnet: bool,
    manifest: PathBuf,
}

#[derive(Debug)]
struct DeploymentManifest {
    network: String,
    wasm_hash: String,
    admin: String,
    constructor_args: Vec<String>,
    addresses: Vec<String>,
    ledger: Option<u32>,
    contract_id: Option<String>,
    dry_run: bool,
}

fn main() {
    let args = match parse_args(env::args().skip(1)) {
        Ok(args) => args,
        Err(err) => {
            eprintln!("error: {err}");
            eprintln!("\n{USAGE}");
            process::exit(2);
        }
    };

    if let Err(err) = validate(&args) {
        eprintln!("validation failed: {err}");
        process::exit(1);
    }

    let network = args.network.clone().expect("validated network");

    if args.dry_run {
        println!("dry-run: validation passed for network '{network}'");
        println!("dry-run: no transaction submitted");
        let manifest = DeploymentManifest {
            network,
            wasm_hash: args.wasm_hash.clone().unwrap_or_default(),
            admin: args.admin.clone().unwrap_or_default(),
            constructor_args: args.constructor_args.clone(),
            addresses: args.addresses.clone(),
            ledger: None,
            contract_id: None,
            dry_run: true,
        };
        if let Err(err) = write_manifest(&args.manifest, &manifest) {
            eprintln!("error: failed to write manifest: {err}");
            process::exit(1);
        }
        println!("manifest written to {}", args.manifest.display());
        return;
    }

    // Submission is delegated to the Soroban CLI; we only orchestrate and
    // record the result so deployments stay reproducible.
    match submit(&args, &network) {
        Ok((ledger, contract_id)) => {
            let manifest = DeploymentManifest {
                network,
                wasm_hash: args.wasm_hash.clone().unwrap_or_default(),
                admin: args.admin.clone().unwrap_or_default(),
                constructor_args: args.constructor_args.clone(),
                addresses: args.addresses.clone(),
                ledger: Some(ledger),
                contract_id: Some(contract_id.clone()),
                dry_run: false,
            };
            if let Err(err) = write_manifest(&args.manifest, &manifest) {
                eprintln!("error: failed to write manifest: {err}");
                process::exit(1);
            }
            println!("deployed contract {contract_id} on {network} at ledger {ledger}");
            println!("manifest written to {}", args.manifest.display());
        }
        Err(err) => {
            eprintln!("deployment failed: {err}");
            process::exit(1);
        }
    }
}

const USAGE: &str = "usage: deploy --network <name> --wasm <path> --wasm-hash <hex> \
--admin <address> [--constructor-arg <value>]... [--address <address>]... \
[--dry-run] [--confirm-mainnet] [--manifest <path>]";

fn parse_args<I: Iterator<Item = String>>(mut iter: I) -> Result<DeployArgs, String> {
    let mut args = DeployArgs {
        manifest: PathBuf::from("deployment.json"),
        ..Default::default()
    };

    while let Some(flag) = iter.next() {
        match flag.as_str() {
            "--network" => args.network = Some(next_value(&mut iter, "--network")?),
            "--wasm" => args.wasm = Some(PathBuf::from(next_value(&mut iter, "--wasm")?)),
            "--wasm-hash" => args.wasm_hash = Some(next_value(&mut iter, "--wasm-hash")?),
            "--admin" => args.admin = Some(next_value(&mut iter, "--admin")?),
            "--constructor-arg" => {
                args.constructor_args.push(next_value(&mut iter, "--constructor-arg")?)
            }
            "--address" => args.addresses.push(next_value(&mut iter, "--address")?),
            "--manifest" => args.manifest = PathBuf::from(next_value(&mut iter, "--manifest")?),
            "--dry-run" => args.dry_run = true,
            "--confirm-mainnet" => args.confirm_mainnet = true,
            "-h" | "--help" => {
                println!("{USAGE}");
                process::exit(0);
            }
            other => return Err(format!("unknown argument '{other}'")),
        }
    }

    Ok(args)
}

fn next_value<I: Iterator<Item = String>>(iter: &mut I, flag: &str) -> Result<String, String> {
    iter.next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("missing value for {flag}"))
}

/// Validate every input before any submission happens.
fn validate(args: &DeployArgs) -> Result<(), String> {
    let network = args
        .network
        .as_deref()
        .ok_or("explicit --network is required (no implicit default)")?;

    if !KNOWN_NETWORKS.contains(&network) {
        return Err(format!(
            "unknown network '{network}', expected one of {KNOWN_NETWORKS:?}"
        ));
    }

    if CONFIRMATION_NETWORKS.contains(&network) && !args.confirm_mainnet {
        return Err(format!(
            "refusing to deploy to '{network}' without --confirm-mainnet"
        ));
    }

    let wasm = args.wasm.as_ref().ok_or("--wasm <path> is required")?;
    if !wasm.is_file() {
        return Err(format!("wasm file not found: {}", wasm.display()));
    }

    let wasm_hash = args
        .wasm_hash
        .as_deref()
        .ok_or("--wasm-hash <hex> is required")?;
    if !is_hex_hash(wasm_hash) {
        return Err(format!(
            "invalid --wasm-hash '{wasm_hash}', expected 64 hex characters"
        ));
    }

    let admin = args.admin.as_deref().ok_or("--admin <address> is required")?;
    if !is_stellar_address(admin) {
        return Err(format!("invalid --admin address '{admin}'"));
    }

    for (index, value) in args.constructor_args.iter().enumerate() {
        if value.trim().is_empty() {
            return Err(format!("constructor argument {index} is empty"));
        }
    }

    for address in &args.addresses {
        if !is_stellar_address(address) {
            return Err(format!("invalid target address '{address}'"));
        }
    }

    Ok(())
}

fn is_hex_hash(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|c| c.is_ascii_hexdigit())
}

/// Stellar strkey addresses are base32 and start with 'G' (account) or 'C'
/// (contract). We keep the check intentionally conservative.
fn is_stellar_address(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some('G') | Some('C') => {}
        _ => return false,
    }
    value.len() == 56
        && value
            .chars()
            .all(|c| c.is_ascii_uppercase() || ('2'..='7').contains(&c))
}

/// Submit via the Soroban CLI and return (ledger, contract_id).
fn submit(args: &DeployArgs, network: &str) -> Result<(u32, String), String> {
    let wasm = args.wasm.as_ref().expect("validated wasm");
    let mut command = process::Command::new("soroban");
    command
        .arg("contract")
        .arg("deploy")
        .arg("--network")
        .arg(network)
        .arg("--wasm")
        .arg(wasm);

    if let Some(admin) = &args.admin {
        command.arg("--source-account").arg(admin);
    }
    for value in &args.constructor_args {
        command.arg("--").arg(value);
    }

    let output = command
        .output()
        .map_err(|err| format!("failed to run soroban CLI: {err}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let contract_id = stdout
        .lines()
        .find_map(|line| line.split_whitespace().find(|token| is_stellar_address(token)))
        .ok_or("could not parse contract id from soroban output")?
        .to_string();

    let ledger = stdout
        .lines()
        .find_map(|line| {
            line.split_whitespace()
                .find_map(|token| token.trim_matches(|c: char| !c.is_ascii_digit()).parse::<u32>().ok())
        })
        .unwrap_or(0);

    Ok((ledger, contract_id))
}

fn write_manifest(path: &PathBuf, manifest: &DeploymentManifest) -> Result<(), String> {
    let json = render_manifest(manifest);
    fs::write(path, json).map_err(|err| err.to_string())
}

/// Minimal JSON rendering so the tool has no extra dependencies.
fn render_manifest(manifest: &DeploymentManifest) -> String {
    let args = manifest
        .constructor_args
        .iter()
        .map(|value| format!("\"{}\"", escape_json(value)))
        .collect::<Vec<_>>()
        .join(", ");
    let addresses = manifest
        .addresses
        .iter()
        .map(|value| format!("\"{}\"", escape_json(value)))
        .collect::<Vec<_>>()
        .join(", ");
    let ledger = manifest
        .ledger
        .map(|value| value.to_string())
        .unwrap_or_else(|| "null".to_string());
    let contract_id = manifest
        .contract_id
        .as_deref()
        .map(|value| format!("\"{}\"", escape_json(value)))
        .unwrap_or_else(|| "null".to_string());

    format!(
        "{{\n  \"network\": \"{}\",\n  \"wasm_hash\": \"{}\",\n  \"admin\": \"{}\",\n  \"constructor_args\": [{}],\n  \"addresses\": [{}],\n  \"ledger\": {},\n  \"contract_id\": {},\n  \"dry_run\": {}\n}}\n",
        escape_json(&manifest.network),
        escape_json(&manifest.wasm_hash),
        escape_json(&manifest.admin),
        args,
        addresses,
        ledger,
        contract_id,
        manifest.dry_run,
    )
}

fn escape_json(value: &str) -> String {
    value
        .chars()
        .flat_map(|c| match c {
            '"' => "\\\"".chars().collect::<Vec<_>>(),
            '\\' => "\\\\".chars().collect(),
            '\n' => "\\n".chars().collect(),
            '\r' => "\\r".chars().collect(),
            '\t' => "\\t".chars().collect(),
            other => vec![other],
        })
        .collect()
}
